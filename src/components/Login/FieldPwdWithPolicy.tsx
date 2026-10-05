import * as React from "react";
import {
  IPwdPolicy,
  IPwdValidationResult,
  validatePassword,
  getPwdTooltip,
} from "./password";
import FieldPwd from "./FieldPwd";

export interface IFieldPwdCopy {
  label?: string;
  placeholder?: string;
}

export interface IFieldPwdWithPolicy {
  className?: string;
  style?: React.CSSProperties;
  pwd: string;
  onChange: (pwd: string, valid: boolean) => void;
  required?: boolean;
  disabled?: boolean;
  loading?: boolean;
  copy?: IFieldPwdCopy;
  pwdPolicy: IPwdPolicy;
  inputRef?: React.Ref<HTMLInputElement>;
}

const FieldPwdWithPolicy = ({
  className,
  style,
  pwd,
  onChange,
  required = true,
  disabled,
  copy = {},
  pwdPolicy,
  inputRef,
}: IFieldPwdWithPolicy) => {
  const [password, setPassword] = React.useState<string>(pwd);
  const [pwdValidationResult, setPwdValidationResult] =
    React.useState<IPwdValidationResult>(
      validatePassword({
        password,
        required,
        pwdPolicy,
      })
    );
  const handleChange = React.useCallback(
    (pwd: string) => {
      if (pwd !== password) {
        const pwdValidationResult = validatePassword({
          password: pwd,
          required,
          pwdPolicy,
        });
        const valid = pwdValidationResult.valid;
        setPassword(pwd);
        setPwdValidationResult(pwdValidationResult);
        onChange(pwd, valid);
      }
    },
    [onChange, password, pwdPolicy, required]
  );
  const pwdTooltip = React.useMemo<string[]>(
    () => getPwdTooltip({ pwdPolicy, pwdValidationResult }),
    [pwdPolicy, pwdValidationResult]
  );

  React.useEffect(() => {
    setPassword(pwd);
    setPwdValidationResult(
      validatePassword({
        password: pwd,
        required,
        pwdPolicy,
      })
    );
  }, [pwd, pwdPolicy, required]);

  return (
    <FieldPwd
      className={className}
      style={style}
      error={!!password && !pwdValidationResult.valid}
      tooltipOpen={!!password && pwdTooltip.length > 0}
      tooltipValue={pwdTooltip}
      value={password}
      label={copy.label}
      onChange={handleChange}
      required={required}
      disabled={disabled}
      inputRef={inputRef}
    />
  );
};
export default FieldPwdWithPolicy;
