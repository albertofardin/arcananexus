import { describe, it, expect } from "vitest";
// Pacchetto CJS interno di Next (senza types pubblici dedicati, risolti qui
// come `any`), usato solo per compilare `config.matcher` esattamente come fa
// Next in produzione (stesso algoritmo, path-to-regexp) invece di
// reimplementarlo a mano e rischiare un falso positivo.
import pathToRegexpModule from "next/dist/compiled/path-to-regexp/index.js";
import { config } from "./middleware";

const { pathToRegexp } = pathToRegexpModule as {
  pathToRegexp: (pattern: string) => RegExp;
};

// T-046: il link di recupero password riporta l'utente su `/?resetPassword=1
// &token=...` proprio perché è l'unico path escluso dal matcher del
// middleware (un path dedicato tipo `/reset-password` sarebbe irraggiungibile
// per un utente sloggato — vedi `.task/046-recupero-password-email.md` e il
// commento sul matcher in `middleware.ts`). Qui verifichiamo il comportamento
// reale del matcher, non solo la sua stringa sorgente.
describe("middleware — matcher (T-046)", () => {
  const matches = (pathname: string): boolean => {
    const [pattern] = config.matcher;
    return pathToRegexp(pattern).test(pathname);
  };

  it("esclude `/` dal matcher — il middleware non intercetta mai la home, dove vive il modale di login/reset password", () => {
    expect(matches("/")).toBe(false);
  });

  it("include invece qualunque altro path applicativo (es. /dashboard)", () => {
    expect(matches("/dashboard")).toBe(true);
    expect(matches("/dashboard/org-slug")).toBe(true);
  });

  it("include un ipotetico path dedicato /reset-password — motivo per cui questo task non ne crea uno", () => {
    expect(matches("/reset-password")).toBe(true);
  });

  it("esclude le route interne di Next e l'handler di Better Auth", () => {
    expect(matches("/api/auth/callback")).toBe(false);
    expect(matches("/_next/static/chunk.js")).toBe(false);
    expect(matches("/favicon.ico")).toBe(false);
  });
});
