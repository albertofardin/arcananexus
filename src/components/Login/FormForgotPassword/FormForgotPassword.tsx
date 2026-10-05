import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  getQueryStringValue,
  FORM_TITLE,
  getFormCurrentUrl,
  IResLogin,
  inLoading,
  Initialize,
} from "../utils";
import Button from "../Button";
import MessageError, { getErrors } from "../MessageError";
import FormChoosePassword from "../FormChoosePassword";
import FormCard from "../FormCard";
import { formForgotPasswordSchema, FormForgotPasswordValues } from "./schema";

export interface IFormForgotPassword {
  goBack: () => void;
  onRequest: (p: { token: string; password: string }) => Promise<IResLogin>;
}

// T-046: il link ricevuto via email arriva su `/?resetPassword=1&token=...`
// (o `&error=INVALID_TOKEN` se Better Auth ha già rifiutato il token —
// scaduto o già usato — prima ancora di mostrare questo form, vedi
// `request-password-reset` in `better-auth/api/routes/password`).
const INVALID_TOKEN_MESSAGE =
  "Il link per reimpostare la password non è valido o è scaduto. Richiedine uno nuovo dal login.";

const FormForgotPassword = ({ goBack, onRequest }: IFormForgotPassword) => {
  const [initConfirm, setInitConfirm] = React.useState<Initialize>(
    Initialize.NONE
  );
  const [errors, setErrors] = React.useState<string[]>([]);
  const form = getFormCurrentUrl();
  const token = getQueryStringValue("token");
  const linkError = getQueryStringValue("error") === "INVALID_TOKEN";
  const missingToken = !token;

  const {
    setValue,
    handleSubmit,
    formState: { isValid },
  } = useForm<FormForgotPasswordValues>({
    resolver: zodResolver(formForgotPasswordSchema),
    mode: "onChange",
    defaultValues: { password: "" },
  });

  const onValidPassword = React.useCallback(
    (value: string) => {
      setValue("password", value, {
        shouldValidate: true,
        shouldDirty: true,
      });
    },
    [setValue]
  );
  const success = initConfirm === Initialize.SUCC;
  const loadingConfirm = inLoading(initConfirm);

  const onValid = React.useCallback(
    async (data: FormForgotPasswordValues) => {
      setInitConfirm(Initialize.WAIT);
      try {
        if (missingToken) throw [INVALID_TOKEN_MESSAGE];
        const { success, message } = await onRequest({
          token,
          password: data.password,
        });
        if (!success) throw message;
        setInitConfirm(Initialize.SUCC);
      } catch (err) {
        const errors = await getErrors(err);
        setInitConfirm(Initialize.FAIL);
        setErrors(errors);
      }
    },
    [missingToken, onRequest, token]
  );

  const onClickBtnConfirm = handleSubmit(onValid);

  // Prima ancora di un submit, un token già rifiutato da Better Auth
  // (`?error=INVALID_TOKEN`) va segnalato subito: niente crash, niente
  // schermata bianca, il form resta comunque utilizzabile per tornare al
  // login e richiedere un nuovo link.
  const showLinkError =
    (linkError || missingToken) && initConfirm === Initialize.NONE;
  const displayInit = showLinkError ? Initialize.FAIL : initConfirm;
  const displayErrors = showLinkError ? [INVALID_TOKEN_MESSAGE] : errors;

  return (
    <FormCard
      goBack={goBack}
      title={FORM_TITLE[form]}
      onSubmit={onClickBtnConfirm}
    >
      <FormChoosePassword
        disabled={loadingConfirm || success || missingToken}
        onValid={onValidPassword}
      />
      {success ? (
        <Button color="var(--succ)" label="VAI AL LOGIN" onClick={goBack} />
      ) : (
        <Button
          color={
            initConfirm === Initialize.FAIL ? "var(--fail)" : "var(--primary)"
          }
          disabled={!isValid || missingToken}
          loading={loadingConfirm}
          label="CONFERMA"
          onClick={onClickBtnConfirm}
        />
      )}
      <MessageError
        init={displayInit}
        messagesFail={displayErrors}
        messagesSucc={["Password aggiornata con successo!"]}
      />
    </FormCard>
  );
};

export default FormForgotPassword;
