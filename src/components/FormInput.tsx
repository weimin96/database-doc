import { useId } from "react";
import { Field,FieldLabel } from "./ui/field";
import { Input } from "./ui/input";
export function FormInput({
  label,
  ...props
}: React.ComponentProps<typeof Input> & { label: string }) {
  const id = useId();
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input id={id} {...props} />
    </Field>
  );
}
