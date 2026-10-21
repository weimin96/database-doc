//! AES-256-GCM encrypted local credentials. The local key is private to the OS user.
//! It does not protect against an attacker who can read both this key and ciphertext.
use ring::{
    aead,
    rand::{SecureRandom, SystemRandom},
};
use std::{
    fs, io,
    path::{Path, PathBuf},
};

const MAGIC: &[u8; 4] = b"DDC1";
const NONCE_LEN: usize = 12;
const KEY_LEN: usize = 32;

fn account(id: &str) -> Result<(), String> {
    uuid::Uuid::parse_str(id).map_err(|_| "数据库连接标识不合法".to_string())?;
    Ok(())
}

fn private_directory(path: &Path) -> Result<(), String> {
    fs::create_dir_all(path).map_err(|_| "无法创建本地凭据目录")?;
    if fs::symlink_metadata(path)
        .map_err(|_| "无法读取本地凭据目录")?
        .file_type()
        .is_symlink()
    {
        return Err("本地凭据目录不能是符号链接".into());
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o700))
            .map_err(|_| "无法设置凭据目录访问权限")?;
    }
    Ok(())
}

fn private_file(path: &Path, bytes: &[u8]) -> Result<(), String> {
    use std::io::Write;
    let mut opts = fs::OpenOptions::new();
    opts.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        opts.mode(0o600);
    }
    let mut file = opts.open(path).map_err(|_| "无法安全创建凭据文件")?;
    if file.write_all(bytes).and_then(|_| file.sync_all()).is_err() {
        let _ = fs::remove_file(path);
        return Err("写入本地加密文件失败".into());
    }
    Ok(())
}

fn load_key(directory: &Path, create: bool) -> Result<Option<[u8; KEY_LEN]>, String> {
    let path = directory.join("master.key");
    let bytes = match fs::read(&path) {
        Ok(bytes) => bytes,
        Err(e) if e.kind() == io::ErrorKind::NotFound && !create => return Ok(None),
        Err(e) if e.kind() == io::ErrorKind::NotFound => {
            let mut key = [0u8; KEY_LEN];
            SystemRandom::new()
                .fill(&mut key)
                .map_err(|_| "无法生成安全随机密钥")?;
            match private_file(&path, &key) {
                Ok(()) => return Ok(Some(key)),
                Err(_) if path.exists() => fs::read(&path).map_err(|_| "无法读取本地加密密钥")?,
                Err(e) => return Err(e),
            }
        }
        Err(_) => return Err("无法读取本地加密密钥".into()),
    };
    if bytes.len() != KEY_LEN {
        return Err("本地加密密钥无效，请重新配置密码".into());
    }
    let mut key = [0u8; KEY_LEN];
    key.copy_from_slice(&bytes);
    Ok(Some(key))
}

fn secret_path(directory: &Path, id: &str) -> Result<PathBuf, String> {
    account(id)?;
    Ok(directory.join(format!("{id}.enc")))
}

fn cipher(key: &[u8; KEY_LEN]) -> Result<aead::LessSafeKey, String> {
    Ok(aead::LessSafeKey::new(
        aead::UnboundKey::new(&aead::AES_256_GCM, key).map_err(|_| "本地加密密钥格式错误")?,
    ))
}

pub fn read(directory: &Path, id: &str) -> Result<Option<String>, String> {
    let path = secret_path(directory, id)?;
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err("无法读取本地加密凭据".into()),
    };
    if bytes.len() < MAGIC.len() + NONCE_LEN + aead::AES_256_GCM.tag_len()
        || !bytes.starts_with(MAGIC)
    {
        return Err("本地加密凭据格式无效，请重新保存密码".into());
    }
    let key = load_key(directory, false)?.ok_or("本地加密密钥丢失，请重新输入密码")?;
    let nonce = aead::Nonce::try_assume_unique_for_key(&bytes[4..16])
        .map_err(|_| "本地加密凭据格式无效")?;
    let mut contents = bytes[16..].to_vec();
    let clear = cipher(&key)?
        .open_in_place(nonce, aead::Aad::from(id.as_bytes()), &mut contents)
        .map_err(|_| "本地加密凭据校验失败，请重新输入密码")?;
    String::from_utf8(clear.to_vec())
        .map(Some)
        .map_err(|_| "本地加密凭据内容损坏，请重新输入密码".into())
}

pub fn save(directory: &Path, id: &str, password: &str) -> Result<(), String> {
    let path = secret_path(directory, id)?;
    private_directory(directory)?;
    let key = load_key(directory, true)?.ok_or("无法创建加密密钥")?;
    let mut nonce = [0u8; NONCE_LEN];
    SystemRandom::new()
        .fill(&mut nonce)
        .map_err(|_| "无法生成安全随机数")?;
    let mut encrypted = password.as_bytes().to_vec();
    cipher(&key)?
        .seal_in_place_append_tag(
            aead::Nonce::assume_unique_for_key(nonce),
            aead::Aad::from(id.as_bytes()),
            &mut encrypted,
        )
        .map_err(|_| "数据库密码加密失败")?;
    let mut content = Vec::with_capacity(16 + encrypted.len());
    content.extend_from_slice(MAGIC);
    content.extend_from_slice(&nonce);
    content.extend_from_slice(&encrypted);
    let pending = directory.join(format!("{}.pending", uuid::Uuid::new_v4()));
    private_file(&pending, &content)?;
    if fs::rename(&pending, &path).is_err() {
        let _ = fs::remove_file(&pending);
        return Err("保存加密凭据失败".into());
    }
    Ok(())
}

pub fn remove(directory: &Path, id: &str) -> Result<(), String> {
    let path = secret_path(directory, id)?;
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(_) => Err("移除本地加密密码失败".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn encryption_roundtrip_integrity_and_scoping() {
        let dir =
            std::env::temp_dir().join(format!("database-doc-crypto-{}", uuid::Uuid::new_v4()));
        let a = uuid::Uuid::new_v4().to_string();
        let b = uuid::Uuid::new_v4().to_string();
        assert_eq!(read(&dir, &a).unwrap(), None);
        assert!(!dir.exists(), "只读路径不得创建主密钥");
        save(&dir, &a, "测试密码/abc123").unwrap();
        assert_eq!(read(&dir, &a).unwrap().as_deref(), Some("测试密码/abc123"));
        assert_eq!(read(&dir, &b).unwrap(), None);
        let encrypted = fs::read(dir.join(format!("{a}.enc"))).unwrap();
        assert!(!encrypted.windows("abc123".len()).any(|x| x == b"abc123"));
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                fs::metadata(&dir).unwrap().permissions().mode() & 0o777,
                0o700
            );
            assert_eq!(
                fs::metadata(dir.join("master.key"))
                    .unwrap()
                    .permissions()
                    .mode()
                    & 0o777,
                0o600
            );
            assert_eq!(
                fs::metadata(dir.join(format!("{a}.enc")))
                    .unwrap()
                    .permissions()
                    .mode()
                    & 0o777,
                0o600
            );
        }
        save(&dir, &b, "another").unwrap();
        fs::write(dir.join(format!("{b}.enc")), encrypted).unwrap();
        assert!(read(&dir, &b).is_err(), "不同连接 ID 不可交换密文");
        let mut corrupted = fs::read(dir.join(format!("{a}.enc"))).unwrap();
        *corrupted.last_mut().unwrap() ^= 1;
        fs::write(dir.join(format!("{a}.enc")), corrupted).unwrap();
        assert!(read(&dir, &a).is_err(), "篡改必须被认证校验发现");
        save(&dir, &a, "new").unwrap();
        assert_eq!(read(&dir, &a).unwrap().as_deref(), Some("new"));
        remove(&dir, &a).unwrap();
        assert_eq!(read(&dir, &a).unwrap(), None);
        assert!(save(&dir, "../invalid", "x").is_err());
        fs::remove_dir_all(dir).unwrap();
    }
}
