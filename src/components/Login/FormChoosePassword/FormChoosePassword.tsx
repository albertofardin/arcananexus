import * as React from "react";
import FieldPwdWithPolicy from "../FieldPwdWithPolicy";
import FieldPwd from "../FieldPwd";
import { PWD_POLICY } from "../password";

export interface IFormChoosePassword {
  disabled?: boolean;
  onValid: (password: string) => void;
}
const FormChoosePassword = ({ disabled, onValid }: IFormChoosePassword) => {
  const [passwordOne, setPasswordOne] = React.useState("");
  const [passwordTwo, setPasswordTwo] = React.useState("");
  const [validPasswordOne, setValidPasswordOne] = React.useState(false);
  const pwdPolicy = PWD_POLICY;

  const onChangePasswordOne = React.useCallback(
    (value: string, valid: boolean) => {
      setPasswordOne(value);
      setValidPasswordOne(valid);
    },
    []
  );
  const onChangePasswordTwo = React.useCallback((value: string) => {
    setPasswordTwo(value);
  }, []);
  const validPasswordTwo = validPasswordOne
    ? passwordOne === passwordTwo
    : true;

  React.useEffect(() => {
    (async () => {
      if (
        !!passwordOne &&
        !!passwordTwo &&
        validPasswordTwo &&
        validPasswordOne
      ) {
        onValid(passwordTwo);
      }
    })();
  }, [passwordOne, passwordTwo, validPasswordOne, validPasswordTwo, onValid]);

  return (
    <>
      <FieldPwdWithPolicy
        pwd={passwordOne}
        required={true}
        disabled={disabled}
        copy={{ label: "Password" }}
        onChange={onChangePasswordOne}
        pwdPolicy={pwdPolicy}
      />
      <FieldPwd
        autoComplete="new-password"
        error={!validPasswordTwo}
        tooltipOpen={!validPasswordTwo}
        tooltipValue={["❌ la password non corrisponde"]}
        disabled={disabled}
        value={passwordTwo}
        label="Ripeti la password"
        onChange={onChangePasswordTwo}
      />
    </>
  );
};

export default FormChoosePassword;
