export enum Initialize {
  NONE = "NONE",
  START = "START",
  WAIT = "WAIT",
  SUCC = "SUCC",
  FAIL = "FAIL",
}

export const ERROR_EMAIL = "Email deve essere un indirizzo valido";

export enum FORM {
  LOGIN = "login",
  REGISTRATION = "registration",
  FORGOT_PASSWORD = "forgotpassword",
  DEMAND_PASSWORD = "resetpassword",
}
export const FORM_TITLE: { [k in FORM]: string } = {
  [FORM.LOGIN]: "Login",
  [FORM.REGISTRATION]: "Registrati",
  [FORM.FORGOT_PASSWORD]: "Password Dimenticata",
  [FORM.DEMAND_PASSWORD]: "Reimposta Password",
};

export const inLoading = (i: Initialize): boolean =>
  i === Initialize.START || i === Initialize.WAIT;

export const getQueryStringValue = (key: string): string => {
  const query = new URLSearchParams(window.location.search);
  return query.get(key) || "";
};
export const getPathCurrentUrl = (): string => {
  const urlObject = new URL(window.location.href);
  const pathname = urlObject.pathname;
  const segments = pathname.split("/");
  const lastSegment = segments.pop();
  return lastSegment;
};
export const getFormCurrentUrl = (): FORM => {
  // T-046: il link di recupero password riporta l'utente su `/` (mai su un
  // path dedicato, vedi `middleware.ts` — un path come `/reset-password`
  // sarebbe irraggiungibile senza sessione) con `?resetPassword=1&token=...`
  // aggiunto da Better Auth dopo la verifica del token. Questo controllo va
  // prima della logica per path, che sotto `/` non può mai risolvere.
  if (getQueryStringValue("resetPassword") === "1") return FORM.FORGOT_PASSWORD;
  const array = new Set(Object.values(FORM));
  const f = getPathCurrentUrl() as FORM;
  return array.has(f) ? f : FORM.LOGIN;
};
export const defaultEmptyFn = async () => null;

export interface IResLogin {
  success: boolean;
  message: string | string[];
}

export interface ISignUp {
  email: string;
  username: string;
  password: string;
  acceptPrivacyTermsOfService: boolean;
  acceptCurrentTermsOfService: boolean;
}
