import { renderDocument } from "./document";
self.onmessage = ({ data }) => {
  try {
    const bytes = renderDocument(data.template, data.tables, data.options);
    self.postMessage({ bytes }, { transfer: [bytes.buffer] });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : "文档生成失败",
    });
  }
};
