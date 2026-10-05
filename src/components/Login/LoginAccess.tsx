"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Login from "./Login";
import { LOGIN_BG, loginTokens } from "./theme";
import { ISignUp } from "./utils";
import Modal from "@/components/_core/Modal";
import Portal from "@/components/_core/Portal";
import Btn from "@/components/_core/Btn";
import { Slide } from "@/components/_core/Transitions";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  authClient,
  requestPasswordReset,
  resetPassword,
  sendVerificationEmail,
} from "@/lib/auth-client";
import { cn } from "@/lib/utils";

// T-046: Better Auth risponde con `status:true` generico anche per
// un'email inesistente (niente enumerazione utenti, vedi
// `request-password-reset` in `better-auth/api/routes/password`), quindi
// `resp.error` per `requestPasswordReset` scatta solo su errori reali (rete,
// rate-limit). I messaggi di Better Auth sono in inglese: mappiamo qui i
// codici noti, senza inoltrare mai `resp.error.message` grezzo in UI.
const RESET_PASSWORD_ERROR_MESSAGES: Record<string, string> = {
  INVALID_TOKEN:
    "Il link per reimpostare la password non è valido o è scaduto. Richiedine uno nuovo.",
  PASSWORD_TOO_SHORT: "La password è troppo corta.",
  PASSWORD_TOO_LONG: "La password è troppo lunga.",
  TOO_MANY_REQUESTS: "Troppi tentativi, riprova tra qualche minuto.",
};

const resetPasswordErrorMessage = (code: string | undefined): string =>
  (code && RESET_PASSWORD_ERROR_MESSAGES[code]) ||
  "Impossibile completare l'operazione, riprova.";

// T-047: login bloccato per email non verificata (`requireEmailVerification`
// in `src/lib/auth.ts`) — messaggio distinto da "credenziali errate", mai il
// testo inglese di Better Auth ("Email not verified"). Better Auth invia già
// da sé un nuovo link a ogni tentativo di login bloccato
// (`emailVerification.sendOnSignIn: true`).
const EMAIL_NOT_VERIFIED_MESSAGE =
  "Email non verificata. Ti abbiamo inviato una nuova email di conferma: controlla la tua casella di posta.";

export interface ILoginAccess {
  open: boolean;
  onClose: () => void;
  /** Dove portare l'utente dopo un accesso riuscito. */
  redirectTo?: string;
  /** Avviso mostrato sopra il form di login (es. sessione scaduta). */
  notice?: string;
}

/**
 * Entry-point d'accesso responsive.
 *
 * - **Desktop**: il Login compare in una `Modal` centrata.
 * - **Mobile**: il Login scivola dal basso come pannello a tutto schermo che
 *   copre l'intera area di lavoro (niente modale).
 *
 * Incapsula anche il wiring di Better Auth (login/registrazione) e il redirect
 * post-accesso, così i punti di chiamata devono solo gestire `open`/`onClose`.
 */
const LoginAccess = ({
  open,
  onClose,
  redirectTo = "/dashboard",
  notice,
}: ILoginAccess) => {
  const router = useRouter();
  const isMobile = useIsMobile();

  const onSuccess = React.useCallback(() => {
    onClose();
    router.push(redirectTo as never);
  }, [onClose, redirectTo, router]);

  const onLogin = React.useCallback(
    async (p: { username: string; password: string; rememberMe: boolean }) => {
      // Passa da `/api/login` (non dal client SDK di Better Auth): quella
      // route risolve lato server sia email sia username nello stesso
      // campo, senza mai esporre al browser l'email dietro uno username
      // indovinato (vedi src/app/api/login/route.ts).
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          identifier: p.username,
          password: p.password,
          rememberMe: p.rememberMe,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        // T-047: `details` porta il code Better Auth (es. "EMAIL_NOT_VERIFIED",
        // vedi src/app/api/login/route.ts) quando disponibile.
        const message =
          data.details === "EMAIL_NOT_VERIFIED"
            ? EMAIL_NOT_VERIFIED_MESSAGE
            : data.error || "Accesso non riuscito";
        return { success: false, message: [message] };
      }
      // Bypassando il client SDK, il suo store di sessione (da cui dipende
      // `useSession()` altrove nell'app) non si aggiorna da solo: va
      // notificato a mano dello stesso segnale che `signIn.email` avrebbe
      // fatto scattare internamente.
      authClient.$store.notify("$sessionSignal");
      onSuccess();
      return { success: true, message: [] };
    },
    [onSuccess]
  );

  const onRegistration = React.useCallback(
    async (p: ISignUp) => {
      // Passa da `/api/signup` (non dal client SDK di Better Auth), come
      // `onLogin` fa già con `/api/login`: così la registrazione beneficia
      // dello stesso rate-limit nativo instradato dal router HTTP (vedi
      // src/app/api/signup/route.ts).
      const response = await fetch("/api/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: p.email,
          name: p.username,
          password: p.password,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        return {
          success: false,
          message: [data.error || "Registrazione non riuscita"],
        };
      }
      // T-047: con `requireEmailVerification` la registrazione non crea più
      // una sessione (`token: null`, vedi `sign-up.mjs` — `shouldSkipAutoSignIn`
      // scatta da sé quando il flag è attivo). Niente redirect automatico in
      // dashboard: l'utente deve prima verificare l'email, il form mostra lo
      // stato "controlla la tua email".
      if (!data.token) {
        return { success: true, message: [] };
      }
      // Bypassando il client SDK, il suo store di sessione (da cui dipende
      // `useSession()` altrove nell'app) non si aggiorna da solo: va
      // notificato a mano dello stesso segnale che `signUp.email` avrebbe
      // fatto scattare internamente (vedi lo stesso commento sopra `onLogin`).
      authClient.$store.notify("$sessionSignal");
      onSuccess();
      return { success: true, message: [] };
    },
    [onSuccess]
  );

  // T-047: reinvio email di verifica su richiesta esplicita dalla schermata
  // post-registrazione ("controlla la tua email"). Risposta generica anche
  // per un'email inesistente/già verificata (niente enumerazione utenti,
  // vedi `/send-verification-email` in
  // `better-auth/dist/api/routes/email-verification.mjs`).
  const onResendVerification = React.useCallback(
    async (p: { username: string }) => {
      const resp = await sendVerificationEmail({
        email: p.username,
        callbackURL: "/dashboard",
      });
      if (resp.error) {
        return {
          success: false,
          message: ["Impossibile inviare l'email, riprova."],
        };
      }
      return { success: true, message: [] };
    },
    []
  );

  // T-046: richiesta di reset password. `redirectTo` è relativo (validato da
  // Better Auth con `allowRelativePaths: true` per i callback URL) e riporta
  // sempre su `/` — stesso pattern già in uso per il login (`?login=1`), mai
  // un path dedicato che il middleware bloccherebbe per un utente sloggato
  // (vedi `middleware.ts` e `getFormCurrentUrl` in `./utils`).
  const onDemandPassword = React.useCallback(
    async (p: { username: string }) => {
      const resp = await requestPasswordReset({
        email: p.username,
        redirectTo: "/?resetPassword=1",
      });
      if (resp.error) {
        return {
          success: false,
          message: [resetPasswordErrorMessage(resp.error.code)],
        };
      }
      return { success: true, message: [] };
    },
    []
  );

  // Imposta la nuova password dato il token dal link email. Niente
  // `onSuccess()`/redirect automatico: `resetPassword` non crea una sessione,
  // l'utente deve rifare login (il form mostra già un bottone "VAI AL LOGIN").
  const onChoosePassword = React.useCallback(
    async (p: { token: string; password: string }) => {
      const resp = await resetPassword({
        newPassword: p.password,
        token: p.token,
      });
      if (resp.error) {
        return {
          success: false,
          message: [resetPasswordErrorMessage(resp.error.code)],
        };
      }
      return { success: true, message: [] };
    },
    []
  );

  // Blocca lo scroll del body mentre il pannello mobile è aperto.
  React.useEffect(() => {
    if (!isMobile || !open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isMobile, open]);

  const login = (
    <Login
      onLogin={onLogin}
      onRegistration={onRegistration}
      onDemandPassword={onDemandPassword}
      onChoosePassword={onChoosePassword}
      onResendVerification={onResendVerification}
      notice={notice}
    />
  );

  // In attesa di sapere la dimensione viewport non renderizziamo nulla: tanto
  // il pannello/modale parte sempre da un click (lato client).
  if (isMobile === null) return null;

  if (isMobile) {
    return (
      <Portal>
        <div
          aria-hidden={!open}
          className={cn(
            "fixed inset-0 z-[2000]",
            !open && "pointer-events-none"
          )}
        >
          <Slide
            direction="top"
            open={open}
            style={{ width: "100%", height: "100%" }}
          >
            <div
              style={{ ...loginTokens, backgroundColor: LOGIN_BG }}
              className="relative flex h-full w-full flex-col min-h-0 flex-1 overflow-y-auto"
            >
              <Btn
                className="absolute top-1 right-1 z-10"
                icon="close"
                tooltip="Chiudi"
                onClick={onClose}
              />
              {login}
            </div>
          </Slide>
        </div>
      </Portal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      contentStyle={{ padding: 0 }}
      content={login}
      // Altezza esplicita: i form diversi dal login sono renderizzati con
      // `Slide` in `position: absolute` (fuori dal flusso) e da soli non danno
      // altezza alla modale. Fissandola, ogni form vive in un box dimensionato
      // e scrolla internamente se più alto. Clampata dal `max-h` della Modal.
      style={{
        border: "2px solid #a4161a",
        height: "min(680px, calc(100vh - 30px))",
        minWidth: 480,
      }}
    />
  );
};

export default LoginAccess;
