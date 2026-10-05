---
id: "048"
title: "Uniforma signup a /api/login + React Hook Form nei 4 form di login"
status: in-review
priority: P1
assignee: dev
branch: task/048-login-signup-rhf
base: main
trello: ""
created: 2026-08-28
updated: 2026-08-28
---

## Obiettivo

Chiudere un gap di sicurezza (la registrazione bypassa il proxy server-side
`/api/login` e chiama `signUp.email` direttamente dal client SDK, senza
rate-limit via router) e rimuovere la duplicazione dei 4 reducer manuali di
`src/components/Login/Form*` sostituendo la gestione dei valori di campo con
React Hook Form + Zod, già in `package.json` ma mai usati nel repo.

Nota di processo: questo task non è passato dal planning `owner` sul board —
il brief è arrivato come piano già approvato dall'utente in chat (analisi
riga per riga del codice coinvolto). Questo file è stato creato dal `dev` per
tracciabilità, con Obiettivo/Scope/Criteri derivati da quel piano.

## Scope

Incluso:

- `src/lib/validations/signup.ts` (nuovo schema Zod `signupSchema`).
- `src/app/api/signup/route.ts` (nuova route, mirror di `/api/login`:
  valida, `callAuthEndpoint(request, "/sign-up/email", ...)`,
  `readAuthEndpointResponse`, forward `set-cookie`, propagazione `APIError`
  as-is, 500 su errore inatteso).
- `src/app/api/signup/__tests__/route.test.ts`.
- `src/components/Login/LoginAccess.tsx`: `onRegistration` passa da
  `signUp.email(...)` a `fetch("/api/signup", ...)` (stesso schema di
  `onLogin`), con `authClient.$store.notify("$sessionSignal")` su successo;
  rimosso l'import `signUp` da `@/lib/auth-client` se non più usato.
- Refactor React Hook Form + Zod di `FormLogin`, `FormRegistration`,
  `FormDemandPassword`, `FormForgotPassword`: sostituiscono i rispettivi
  `reducer.ts` (solo per i valori di campo; lo stato di submit
  loading/success/fail basato su `Initialize` resta) con `useForm` +
  `zodResolver` + `Controller` per i field presentazionali non standard.
  Schema Zod locale in un file `schema.ts` per form (solo UX client, non
  sostituisce la validazione server-side esistente).
- Test di componente per `FormLogin` e `FormRegistration` (submit
  disabilitato se form invalido, errore mostrato su richiesta fallita,
  successo mostrato).

Escluso (esplicitamente fuori scope, deciso dall'utente):

- `FormChoosePassword/` (non toccato, resta con il suo reducer interno,
  esposto via `onValid(password)`).
- Correzione della validazione email su "username o email" in
  `FormDemandPassword` (comportamento preesistente, riprodotto as-is).
- Rinominare `FormDemandPassword`/`FormForgotPassword` nonostante il naming
  invertito.
- Riscrittura dei componenti presentazionali `FieldInput`/`FieldPwd`/
  `FieldPwdWithPolicy`/`FieldCheckbox`/`FormCard`/`Button`/`MessageError`
  (API pubblica invariata, wiring via `Controller`).
- L'enum condiviso `Initialize` (`_stories/interfaces.ts`) non viene toccato.

## Criteri di accettazione

- [x] `POST /api/signup` valida con `signupSchema`, instrada via
      `callAuthEndpoint(request, "/sign-up/email", ...)`, forwarda il cookie
      di sessione, propaga gli errori Better Auth (es. "Nome utente già in
      uso"), risponde 500 su errore inatteso, 405 su metodi non ammessi.
- [x] `LoginAccess.tsx` non importa più `signUp` da `@/lib/auth-client`;
      `onRegistration` usa `/api/signup` e notifica `$sessionSignal` sul
      successo, come `onLogin`.
- [x] `FormLogin`, `FormRegistration`, `FormDemandPassword`,
      `FormForgotPassword` usano `useForm` + `zodResolver` per i valori di
      campo; i rispettivi `reducer.ts` sono rimossi (se non più referenziati
      altrove).
- [x] UX invariata: submit disabilitato a form non valido, invio con Enter
      dal campo, tooltip di errore sui campi, messaggi via `MessageError`
      con lo stesso `role`/`aria-live` di oggi.
- [x] `bun run format`, `bun run lint`, `bun run type-check` puliti.
- [x] `bun run test:run` verde (nuovi test inclusi), o eventuali fallimenti
      pre-esistenti documentati nel Log.

## Artifacts

files_modified:

- src/lib/validations/signup.ts (nuovo)
- src/app/api/signup/route.ts (nuovo)
- `src/app/api/signup/__tests__/route.test.ts` (nuovo)
- src/components/Login/LoginAccess.tsx
- src/components/Login/FormLogin/{FormLogin.tsx,schema.ts,FormLogin.test.tsx}
  (reducer.ts rimosso)
- src/components/Login/FormRegistration/{FormRegistration.tsx,schema.ts,FormRegistration.test.tsx}
  (reducer.ts rimosso)
- src/components/Login/FormDemandPassword/{FormDemandPassword.tsx,schema.ts}
  (reducer.ts rimosso)
- src/components/Login/FormForgotPassword/{FormForgotPassword.tsx,schema.ts}
  (reducer.ts rimosso)

interfaces:

- "buildFormLoginSchema(hiddenTenant: boolean) -> ZodObject { tenantId,
  username, password, rememberMe }, con FormLoginValues = z.infer<...>"
- "buildFormDemandPasswordSchema(hiddenTenant: boolean) -> ZodObject
  { tenantId, username }"
- "formRegistrationSchema / formForgotPasswordSchema: ZodObject statici,
  stesso pattern"
- "POST /api/signup: body { email, name, password } -> forward a
  /sign-up/email via callAuthEndpoint, stesso contratto di /api/login"

decisions:

- "watch() di RHF sostituito con useWatch({control,name}) in
  FormRegistration/FormDemandPassword: watch() fa scattare il warning ESLint
  'react-hooks/incompatible-library' del React Compiler (API non
  memoizzabile), useWatch è la forma compiler-friendly per isolare il
  re-render su un singolo campo"
- "Query dei bottoni nei test via screen.getByRole('button', {name}) invece
  di [role] generico: Text (Btn label) ha sempre role='presentation'
  hardcoded, solo il div esterno di BtnBase alterna
  role='button'/'presentation' in base a disabled — [role] generico
  intercetta il <p> sbagliato"
- "fireEvent.click nei test dei form passa sempre {detail: 1}: BtnBase
  discrimina singolo/doppio click da event.detail, che jsdom non imposta a 1
  di default (stesso pattern già usato in CharacterCreation.test.tsx)"
- "isValid dei 4 form deriva da formState.isValid (zodResolver, mode
  onChange) al posto dei calcoli manuali (allfilled/someError) dei reducer:
  stessa logica, meno duplicazione"

## Note / Log (append-only, una riga per evento)

- 2026-08-28 (dev): inizio implementazione, task creato a valle di un brief
  approvato dall'utente in chat (non dal planning owner), branch
  `task/048-login-signup-rhf` da `main`.
- 2026-08-28 (dev): parte A (route /api/signup + LoginAccess) e parte B
  (RHF+Zod nei 4 form, reducer rimossi) implementate; aggiunti test per
  FormLogin e FormRegistration. `bun run format`/`lint`/`type-check` puliti
  (solo warning preesistente non correlato: PaletteIcon inutilizzata).
  `bun run test:run` verde: 139 file, 1757 test. Task portato a in-review,
  branch `task/048-login-signup-rhf` (verificabile con
  `git log main..task/048-login-signup-rhf`).
