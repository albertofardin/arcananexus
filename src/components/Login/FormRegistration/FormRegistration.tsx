import * as React from "react";
import { useForm, useWatch, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  FORM,
  FORM_TITLE,
  IResLogin,
  ISignUp,
  inLoading,
  Initialize,
  ERROR_EMAIL,
} from "../utils";
import FieldInput from "../FieldInput";
import FieldCheckbox from "../FieldCheckbox";
import FormCard from "../FormCard";
import Button from "../Button";
import MessageError, { getErrors } from "../MessageError";
import FormChoosePassword from "../FormChoosePassword";
import Btn from "../../_core/Btn";
import { formRegistrationSchema, FormRegistrationValues } from "./schema";

export interface IFormRegistration {
  goBack: () => void;
  onRequest: (p: ISignUp) => Promise<IResLogin>;
  /** T-047: reinvio email di verifica dalla schermata post-registrazione. */
  onResend?: (p: { username: string }) => Promise<IResLogin>;
}
const FormRegistration = ({
  goBack,
  onRequest,
  onResend,
}: IFormRegistration) => {
  const [initConfirm, setInitConfirm] = React.useState<Initialize>(
    Initialize.NONE
  );
  const [errors, setErrors] = React.useState<string[]>([]);
  // T-047: serve al bottone "invia di nuovo" dopo il successo, quando i
  // campi del form sono già disabilitati — non si può rileggere `email` da
  // `useWatch` in quel momento con la stessa affidabilità di un ref.
  const registeredEmailRef = React.useRef("");
  const [resendInit, setResendInit] = React.useState<Initialize>(
    Initialize.NONE
  );
  const [resendErrors, setResendErrors] = React.useState<string[]>([]);

  const {
    control,
    handleSubmit,
    setValue,
    formState: { isValid, errors: fieldErrors },
  } = useForm<FormRegistrationValues>({
    resolver: zodResolver(formRegistrationSchema),
    mode: "onChange",
    defaultValues: {
      email: "",
      username: "",
      password: "",
      acceptPrivacyTermsOfService: false,
      acceptCurrentTermsOfService: false,
    },
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

  const loading = inLoading(initConfirm);
  const success = initConfirm === Initialize.SUCC;
  const email = useWatch({ control, name: "email" });
  // Come nel comportamento preesistente: il tooltip di formato email compare
  // solo a campo compilato, non quando è semplicemente vuoto.
  const tooltipOpenEmail = !!email && !!fieldErrors.email;

  const onValid = React.useCallback(
    async (data: FormRegistrationValues) => {
      setInitConfirm(Initialize.WAIT);
      try {
        const { success, message } = await onRequest(data);
        if (!success) throw message;
        registeredEmailRef.current = data.email;
        setInitConfirm(Initialize.SUCC);
      } catch (err) {
        const errors = await getErrors(err);
        setInitConfirm(Initialize.FAIL);
        setErrors(errors);
      }
    },
    [onRequest]
  );

  const onClickResend = React.useCallback(async () => {
    if (!onResend) return;
    setResendInit(Initialize.WAIT);
    try {
      const { success, message } = await onResend({
        username: registeredEmailRef.current,
      });
      if (!success) throw message;
      setResendInit(Initialize.SUCC);
    } catch (err) {
      const errors = await getErrors(err);
      setResendInit(Initialize.FAIL);
      setResendErrors(errors);
    }
  }, [onResend]);

  const onConfirm = handleSubmit(onValid);
  const onEnter = React.useCallback(() => {
    onConfirm();
    document.documentElement.blur();
  }, [onConfirm]);

  return (
    <FormCard
      goBack={goBack}
      title={FORM_TITLE[FORM.REGISTRATION]}
      onSubmit={onConfirm}
    >
      <Controller
        name="email"
        control={control}
        render={({ field }) => (
          <FieldInput
            key="email"
            id="email"
            label="Email"
            icon="email"
            placeholder="email@dominio.com"
            required={true}
            value={field.value}
            onChange={(value, _id, pressEnter) => {
              field.onChange(value);
              if (pressEnter) onEnter();
            }}
            disabled={loading || success}
            error={initConfirm === Initialize.FAIL}
            tooltipOpen={tooltipOpenEmail}
            tooltipValue={[ERROR_EMAIL]}
          />
        )}
      />
      <Controller
        name="username"
        control={control}
        render={({ field }) => (
          <FieldInput
            key="username"
            id="username"
            label="Nome Utente"
            icon="person"
            placeholder="username per accedere (non nome PG)"
            required={true}
            value={field.value}
            onChange={(value, _id, pressEnter) => {
              field.onChange(value);
              if (pressEnter) onEnter();
            }}
            disabled={loading || success}
            error={initConfirm === Initialize.FAIL}
          />
        )}
      />
      <FormChoosePassword
        disabled={loading || success}
        onValid={onValidPassword}
      />
      <Controller
        name="acceptPrivacyTermsOfService"
        control={control}
        render={({ field }) => (
          <FieldCheckbox
            id="acceptPrivacyTermsOfService"
            selected={field.value}
            onChange={value => field.onChange(value)}
            readOnly={loading || success}
            required
            link="https://www.arcanadomine.it/privacy-policy/"
            label="Dichiaro di aver letto ed aderire alla Privacy Policy"
          />
        )}
      />

      <Controller
        name="acceptCurrentTermsOfService"
        control={control}
        render={({ field }) => (
          <FieldCheckbox
            id="acceptCurrentTermsOfService"
            selected={field.value}
            onChange={value => field.onChange(value)}
            readOnly={loading || success}
            required
            link=""
            label="Dichiaro di dare il mio consenso al trattamento dei dati personali fornitovi"
          />
        )}
      />
      {success ? (
        <Button color="var(--succ)" label="TORNA AL LOGIN" onClick={goBack} />
      ) : (
        <Button
          color={
            initConfirm === Initialize.FAIL ? "var(--fail)" : "var(--primary)"
          }
          label="CONFERMA"
          loading={loading}
          disabled={!isValid}
          onClick={onConfirm}
        />
      )}
      <MessageError
        init={initConfirm}
        messagesFail={errors}
        messagesSucc={[
          "Registrazione completata. Controlla la tua email per confermare l'indirizzo.",
        ]}
      />
      {success && onResend && (
        <>
          <Btn
            label="Invia di nuovo l'email di conferma"
            disabled={resendInit === Initialize.WAIT}
            onClick={onClickResend}
          />
          <MessageError
            init={resendInit === Initialize.WAIT ? Initialize.NONE : resendInit}
            messagesFail={resendErrors}
            messagesSucc={["Email inviata di nuovo."]}
          />
        </>
      )}
    </FormCard>
  );
};

export default FormRegistration;
