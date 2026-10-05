import * as React from "react";
import FieldInput from "./FieldInput";

const FieldPwd = ({
  className,
  style,
  value,
  label,
  id,
  required,
  disabled,
  error,
  tooltipOpen,
  tooltipValue,
  onChange,
  inputName,
  autoComplete,
  inputRef,
}: {
  className?: string;
  style?: React.CSSProperties;
  value: string;
  label: string;
  id?: string;
  required?: boolean;
  disabled?: boolean;
  error?: boolean;
  tooltipOpen?: boolean;
  tooltipValue?: string[];
  onChange: (value: string, id: string, pressEnter: boolean) => void;
  inputName?: string;
  autoComplete?: string;
  inputRef?: React.Ref<HTMLInputElement>;
}) => (
  <FieldInput
    className={className}
    style={style}
    error={error}
    id={id}
    tooltipOpen={tooltipOpen}
    tooltipValue={tooltipValue}
    value={value}
    label={label}
    onChange={onChange}
    inputType="password"
    required={required}
    disabled={disabled}
    inputName={inputName}
    autoComplete={autoComplete}
    placeholder="******"
    icon="lock"
    inputRef={inputRef}
  />
);

export default FieldPwd;
