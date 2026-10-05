"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

// Evita open-redirect: `redirectTo` arriva da una query string, quindi va
// accettato solo se è un path relativo interno (mai un URL assoluto/protocol
// relative verso un altro host).
const isSafeRedirect = (path: string | null): path is string =>
  !!path && path.startsWith("/") && !path.startsWith("//");

interface ILoginFromQuery {
  onRedirectLogin: (redirectTo?: string) => void;
  /** T-046: link di recupero password, `?resetPassword=1&token=...`. */
  onResetPasswordLogin: () => void;
}

/**
 * Legge `?login=1&redirectTo=...` (impostati dal redirect di `middleware.ts`
 * quando un visitatore anonimo prova ad aprire `/dashboard`) o
 * `?resetPassword=1&token=...` (link email di recupero password, T-046) e
 * apre il pannello di login. Isolato in un componente a parte + `Suspense`
 * nel chiamante: `useSearchParams` fa bail-out a CSR solo di questo
 * frammento, non dell'intera home — che così resta prerenderabile e
 * cacheabile in edge invece di essere ricalcolata ad ogni richiesta.
 */
const LoginFromQuery = ({
  onRedirectLogin,
  onResetPasswordLogin,
}: ILoginFromQuery) => {
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get("login") === "1") {
      const redirectTo = searchParams.get("redirectTo");
      onRedirectLogin(isSafeRedirect(redirectTo) ? redirectTo : undefined);
    } else if (searchParams.get("resetPassword") === "1") {
      onResetPasswordLogin();
    }
  }, [searchParams, onRedirectLogin, onResetPasswordLogin]);

  return null;
};

export default LoginFromQuery;
