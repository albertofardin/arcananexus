import * as React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { FORM, FORM_TITLE, IResLogin, inLoading, Initialize } from "../utils";
import FieldInput from "../FieldInput";
import Button from "../Button";
import MessageError, { getErrors } from "../MessageError";
import FormCard from "../FormCard";
import Text from "../../_core/Text";
import { formDemandPasswordSchema, FormDemandPasswordValues } from "./schema";

export interface IFormDemandPassword {
  goBack: () => void;
  onRequest: (p: { username: string }) => Promise<IResLogin>;
}
const FormDemandPassword = ({ goBack, onRequest }: IFormDemandPassword) => {
  const [init, setInit] = React.useState<Initialize>(Initialize.NONE);
  const [errors, setErrors] = React.useState<string[]>([]);

  const {
    control,
    handleSubmit,
    formState: { isValid, errors: fieldErrors },
  } = useForm<FormDemandPasswordValues>({
    resolver: zodResolver(formDemandPasswordSchema),
    mode: "onChange",
    defaultValues: { username: "" },
  });

  const loading = inLoading(init);
  const success = init === Initialize.SUCC;

  const onValid = React.useCallback(
    async (data: FormDemandPasswordValues) => {
      setInit(Initialize.WAIT);
      try {
        const { success, message } = await onRequest(data);
        if (!success) throw message;
        setInit(Initialize.SUCC);
      } catch (err) {
        const errors = await getErrors(err);
        setInit(Initialize.FAIL);
        setErrors(errors);
      }
    },
    [onRequest]
  );

  const onConfirm = handleSubmit(onValid);
  const onEnter = React.useCallback(() => {
    onConfirm();
    document.documentElement.blur();
  }, [onConfirm]);

  return (
    <FormCard
      goBack={goBack}
      title={FORM_TITLE[FORM.DEMAND_PASSWORD]}
      onSubmit={onConfirm}
    >
      <Text children="Inserisci il tuo indirizzo email. Riceverai un'email con le istruzioni su come reimpostare la tua password." />
      <Controller
        name="username"
        control={control}
        render={({ field }) => (
          <FieldInput
            autoComplete="username email"
            inputType="text"
            inputName="username"
            icon="email"
            placeholder="email@dominio.com"
            value={field.value}
            onChange={(value, _id, pressEnter) => {
              field.onChange(value);
              if (pressEnter) onEnter();
            }}
            disabled={loading || success}
            error={init === Initialize.FAIL}
            tooltipOpen={!!field.value && !!fieldErrors.username}
            tooltipValue={[fieldErrors.username?.message ?? ""]}
          />
        )}
      />
      {success ? (
        <Button color="var(--succ)" label="RITORNA AL LOGIN" onClick={goBack} />
      ) : (
        <Button
          color={init === Initialize.FAIL ? "var(--fail)" : "var(--primary)"}
          label="REIMPOSTA"
          loading={loading}
          disabled={!isValid}
          onClick={onConfirm}
        />
      )}
      <MessageError
        init={init}
        messagesFail={errors}
        messagesSucc={[
          "Ti abbiamo inviato un'email con un link per reimpostare la tua password",
        ]}
      />
    </FormCard>
  );
};

export default FormDemandPassword;
