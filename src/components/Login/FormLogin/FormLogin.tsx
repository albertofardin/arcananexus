"use client";

import * as React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import FormCard from "../FormCard";
import FieldInput from "../FieldInput";
import FieldPwd from "../FieldPwd";
import Button from "../Button";
import MessageError, { getErrors } from "../MessageError";
import { IResLogin, Initialize } from "../utils";
import { LOGIN_DIVIDER_GRADIENT, LOGIN_GOLD } from "../theme";
import LogoArcanaDomine from "../../LogoArcanaDomine";
import { buildFormLoginSchema, FormLoginValues } from "./schema";
import Text from "@/components/_core/Text";
import Btn from "@/components/_core/Btn";
import BtnCheckbox from "@/components/_core/BtnCheckbox";
import Icon from "@/components/_core/Icon";

export interface IFormLogin {
  onRequest: (p: {
    tenantId: string;
    username: string;
    password: string;
    rememberMe: boolean;
  }) => Promise<IResLogin>;
  hiddenTenant?: boolean;
  onClickRegistration: () => void;
  onClickForgotPassword: () => void;
  /** Avviso mostrato sopra il form (es. sessione scaduta). */
  notice?: string;
}

const FormLogin = ({
  onRequest,
  hiddenTenant,
  onClickRegistration,
  onClickForgotPassword,
  notice,
}: IFormLogin) => {
  const [init, setInit] = React.useState<Initialize>(Initialize.NONE);
  const [errors, setErrors] = React.useState<string[]>([]);
  const loading = init === Initialize.WAIT;

  const schema = React.useMemo(
    () => buildFormLoginSchema(!!hiddenTenant),
    [hiddenTenant]
  );

  const {
    control,
    handleSubmit,
    formState: { isValid },
  } = useForm<FormLoginValues>({
    resolver: zodResolver(schema),
    mode: "onChange",
    defaultValues: {
      tenantId: "",
      username: "",
      password: "",
      rememberMe: false,
    },
  });

  const onValid = React.useCallback(
    async (data: FormLoginValues) => {
      setInit(Initialize.WAIT);
      try {
        const { success, message } = await onRequest(data);
        if (!success) throw message;
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
    <FormCard onSubmit={onConfirm}>
      <div
        className="
          mt-[-10px] mb-[10px] flex w-full flex-col items-center
          px-[16px] py-[18px]
        "
      >
        <LogoArcanaDomine color="#000" className="w-full max-w-[320px]" />

        <span
          className="
            mt-[8px] whitespace-nowrap text-center text-[9px] font-bold uppercase
            bg-clip-text text-transparent
          "
          style={{
            letterSpacing: "0.22em",
            backgroundImage: `linear-gradient(100deg, ${LOGIN_GOLD}, #8a6d3b, ${LOGIN_GOLD})`,
          }}
        >
          Associazione di gioco di ruolo dal vivo
        </span>
      </div>

      <div className="flex items-center justify-center gap-[10px]">
        <span
          className="h-px w-[120px]"
          style={{
            background: LOGIN_DIVIDER_GRADIENT,
          }}
        />
        <div
          className="h-[5px] w-[5px] rotate-45 border"
          style={{ borderColor: LOGIN_GOLD }}
        />
        <span
          className="h-px w-[120px]"
          style={{
            background: LOGIN_DIVIDER_GRADIENT,
          }}
        />
      </div>

      <div className="m-[10px]" />

      {notice && (
        <div
          role="status"
          className="mb-[10px] flex w-full items-center gap-2 rounded px-3 py-2 text-[13px] font-normal text-black/80"
          style={{ backgroundColor: "var(--warn)" }}
        >
          <Icon style={{ fontSize: 18 }} children="info" />
          <span>{notice}</span>
        </div>
      )}

      <Text
        size={2}
        weight="bolder"
        className="self-start ml-[5px]"
        children="Bentornato avventuriero"
      />

      <Text
        className="self-start ml-[5px]"
        children="Accedi al tuo account e continua la tua storia"
      />

      <div className="m-[5px]" />

      {!hiddenTenant && (
        <Controller
          name="tenantId"
          control={control}
          render={({ field }) => (
            <FieldInput
              autoComplete="organization"
              inputType="text"
              inputName="organization"
              icon="domain"
              label="Company"
              value={field.value}
              onChange={(value, _id, pressEnter) => {
                field.onChange(value);
                if (pressEnter) onEnter();
              }}
              disabled={loading}
              error={init === Initialize.FAIL}
            />
          )}
        />
      )}

      <Controller
        name="username"
        control={control}
        render={({ field }) => (
          <FieldInput
            autoComplete="username"
            inputType="text"
            inputName="username"
            icon="person"
            label="Email/Username"
            placeholder="email@dominio.com oppure nome utente"
            value={field.value}
            onChange={(value, _id, pressEnter) => {
              field.onChange(value);
              if (pressEnter) onEnter();
            }}
            disabled={loading}
            error={init === Initialize.FAIL}
          />
        )}
      />

      <Controller
        name="password"
        control={control}
        render={({ field }) => (
          <FieldPwd
            autoComplete="current-password"
            inputName="password"
            label="Password"
            value={field.value}
            onChange={(value, _id, pressEnter) => {
              field.onChange(value);
              if (pressEnter) onEnter();
            }}
            disabled={loading}
            error={init === Initialize.FAIL}
          />
        )}
      />

      <div className="mt-[5px] flex w-full flex-row justify-between">
        <Controller
          name="rememberMe"
          control={control}
          render={({ field }) => (
            <BtnCheckbox
              label="Ricordami"
              selected={field.value}
              onClick={field.onChange}
              checkboxStyle={{ backgroundColor: "#fff" }}
            />
          )}
        />
        <Btn label="password dimenticata?" onClick={onClickForgotPassword} />
      </div>

      <Button
        color={init === Initialize.FAIL ? "var(--fail)" : "var(--primary)"}
        label="ACCEDI"
        loading={loading}
        disabled={!isValid}
        onClick={onConfirm}
      />

      <MessageError init={init} messagesFail={errors} messagesSucc={[]} />

      <div
        className="
          flex items-center justify-center gap-[10px]
        "
      >
        <span
          className="h-px w-[120px]"
          style={{
            background: LOGIN_DIVIDER_GRADIENT,
          }}
        />
        <Text children="OPPURE" />
        <span
          className="h-px w-[120px]"
          style={{
            background: LOGIN_DIVIDER_GRADIENT,
          }}
        />
      </div>
      <Btn
        onClick={onClickRegistration}
        className="
          my-[20px]
          h-[60px] max-h-none
          w-full max-w-none
          text-center
          bg-white
        "
        style={{ borderColor: LOGIN_GOLD }}
        label={
          <>
            <span>Non hai ancora un account?</span>
            <br />
            <span className=" text-[14px] font-bold text-primary">
              REGISTRATI
            </span>
          </>
        }
      />
    </FormCard>
  );
};

export default FormLogin;
