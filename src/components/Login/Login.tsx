"use client";

import * as React from "react";
import Card from "../_core/Card";
import { Zoom, Slide } from "../_core/Transitions";
import FormLogin from "./FormLogin";
import FormDemandPassword from "./FormDemandPassword";
import FormForgotPassword from "./FormForgotPassword";
import FormRegistration from "./FormRegistration";
import {
  FORM,
  FORM_TITLE,
  IResLogin,
  ISignUp,
  defaultEmptyFn,
  getFormCurrentUrl,
} from "./utils";
import { LOGIN_MAGIC_BG, loginTokens, LOGIN_SURFACE } from "./theme";
import { cn } from "@/lib/utils";

export interface ILogin {
  style?: React.CSSProperties;
  className?: string;
  onLogin: (p: {
    tenantId: string;
    username: string;
    password: string;
    rememberMe: boolean;
  }) => Promise<IResLogin>;
  onDemandPassword?: (p: { username: string }) => Promise<IResLogin>;
  onChoosePassword?: (p: {
    token: string;
    password: string;
  }) => Promise<IResLogin>;
  onRegistration?: (p: ISignUp) => Promise<IResLogin>;
  onResendVerification?: (p: { username: string }) => Promise<IResLogin>;
  hiddenTenant?: boolean;
  /** Avviso mostrato sopra il form di login (es. sessione scaduta). */
  notice?: string;
}

const Login = ({
  className,
  style,
  onLogin,
  onRegistration = defaultEmptyFn,
  onDemandPassword = defaultEmptyFn,
  onChoosePassword = defaultEmptyFn,
  onResendVerification = defaultEmptyFn,
  hiddenTenant = true,
  notice,
}: ILogin) => {
  const [form, setForm] = React.useState<FORM | null>(null);

  const showForm = React.useCallback((value: FORM) => {
    document.title = FORM_TITLE[value];
    setForm(value);
  }, []);
  const toLogin = React.useCallback(() => showForm(FORM.LOGIN), [showForm]);
  const toRegistration = React.useCallback(
    () => showForm(FORM.REGISTRATION),
    [showForm]
  );
  const toDemandPassword = React.useCallback(
    () => showForm(FORM.DEMAND_PASSWORD),
    [showForm]
  );

  React.useEffect(() => {
    showForm(getFormCurrentUrl());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Card
      elevation={0}
      style={
        {
          // Il Login è una "isola di tema": ridefinisce le CSS vars così resta
          // sempre la stessa palette light fantasy, anche dentro la dashboard
          // in dark mode o dietro temi diversi.
          ...loginTokens,
          backgroundColor: LOGIN_SURFACE,
          backgroundImage: LOGIN_MAGIC_BG,
          // `safe center`: centra il form quando c'è spazio, ma su schermi
          // bassi ripiega su allineamento in alto così resta scrollabile
          // (evita che logo/testa del form finiscano sopra l'area scrollabile).
          alignItems: "safe center",
          ...style,
        } as React.CSSProperties
      }
      className={cn(
        `
            relative z-[1] h-full w-full
            overflow-x-hidden
            overflow-y-auto
            border-0 rounded-none
            bg-card
          `,
        className
      )}
    >
      <Zoom className="w-full" open={!form || form === FORM.LOGIN}>
        <FormLogin
          onRequest={onLogin}
          onClickRegistration={toRegistration}
          onClickForgotPassword={toDemandPassword}
          hiddenTenant={hiddenTenant}
          notice={notice}
        />
      </Zoom>

      <Slide direction="left" open={form === FORM.DEMAND_PASSWORD}>
        <FormDemandPassword goBack={toLogin} onRequest={onDemandPassword} />
      </Slide>
      <Slide direction="left" open={form === FORM.FORGOT_PASSWORD}>
        <FormForgotPassword goBack={toLogin} onRequest={onChoosePassword} />
      </Slide>
      <Slide direction="left" open={form === FORM.REGISTRATION}>
        <FormRegistration
          goBack={toLogin}
          onRequest={onRegistration}
          onResend={onResendVerification}
        />
      </Slide>
    </Card>
  );
};

export default Login;
