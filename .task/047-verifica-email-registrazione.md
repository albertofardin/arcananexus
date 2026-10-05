---
id: "047"
title: "Verifica email in registrazione (Better Auth email verification)"
status: in-review
priority: P0
assignee: dev
branch: task/046-recupero-password-email
base: main
trello: "https://trello.com/c/NyMfditu/2-be-registrazione-utente-con-verifica-email"
created: 2026-08-19
updated: 2026-09-08
---

## Obiettivo

Un nuovo utente che si registra deve confermare di possedere l'indirizzo email
dichiarato prima di poter accedere: oggi (`FormRegistration` → `signUp.email` in
`LoginAccess.tsx`) la registrazione crea l'utente e lo porta **subito** in
dashboard, senza alcuna verifica — chiunque può registrarsi con un'email non sua.
Rischio concreto: account fantasma/impersonati, nessuna garanzia che l'indirizzo
usato per comunicazioni di campagna sia raggiungibile.

Card Trello correlate (stesso task full-stack): "[BE] Registrazione utente con
verifica email" (https://trello.com/c/NyMfditu) e "[FE] Pagina verifica email"
(https://trello.com/c/CsfsGK5a/18-fe-pagina-verifica-email).

## Scope

Incluso:

- **Config Better Auth** (`src/lib/auth.ts`): blocco `emailVerification: {
sendVerificationEmail, sendOnSignUp: true, ... }` (oggi assente: nessuna verifica
  email è configurata, `emailVerified` sul modello `User` esiste già a schema ma
  non è mai popolato da un flusso reale, solo impostato a `true` manualmente nel
  seed) + `emailAndPassword.requireEmailVerification: true` per bloccare il login
  finché non verificato. Decidere e documentare in Log `autoSignInAfterVerification`
  e l'`expiresIn` del token (default vs esplicito).
- **Riuso del client email transazionale** costruito nel task 046
  (`src/lib/email/...`) — non duplicare l'integrazione Brevo. Se il branch di 046
  non è ancora mergiato in `main` quando parte questo task, vedi Note (§12 del
  README, gating su PR aperte).
- Template email di verifica in italiano (oggetto + link).
- **FE**:
  - Dopo `signUp.email` in `LoginAccess.tsx`, sostituire il redirect immediato in
    dashboard (`onSuccess()`) con lo step "verifica la tua email" quando l'utente
    non risulta ancora verificato — nuovo form/schermata (Trello FE #18:
    "schermata di attesa verifica email con possibilità di reinviare il link"),
    stile coerente con `FormCard`/`Button`/`MessageError` esistenti.
  - Pulsante "invia di nuovo" che chiama il metodo dell'`authClient` per il resend
    (verificare nome esatto su `better-auth@^1.4.7`, es. `sendVerificationEmail`),
    con feedback di successo/errore in italiano.
  - `onLogin` in `LoginAccess.tsx` oggi mostra solo `resp.error.message ||
"Accesso non riuscito"` per qualunque errore: quando l'errore è "email non
    verificata", va distinto con un messaggio esplicito (e idealmente un link per
    reinviare l'email) invece del generico "Accesso non riuscito".
  - Stesso vincolo di routing di 046: il link ricevuto via email va aperto da
    utente **non loggato** — riusare il pattern `/?verifyEmail=1&token=...` sul
    modale esistente (coerente con `?login=1` già in uso), non una pagina dedicata
    che `middleware.ts` reindirizzerebbe a `/` (vedi 046 per il dettaglio del
    gotcha).
- Test: config Better Auth (callback + `requireEmailVerification`), FE (schermata
  attesa, resend, messaggio di login bloccato), route se viene toccato codice
  server oltre alla config di `auth.ts`.

Escluso:

- Retroattività sugli utenti esistenti: il seed imposta già `emailVerified: true`
  per gli utenti demo, nessuna migrazione dati necessaria per loro.
- Recupero account quando l'email di registrazione non è più accessibile (fuori
  scope, non richiesto ora).
- Reset password da loggato o dimenticata (task 006 già fatto / task 046).
- Client email transazionale da zero (costruito in 046, qui solo riusato).

## Criteri di accettazione

- [x] Un nuovo utente che completa la registrazione riceve un'email di verifica
      (`sendOnSignUp: true`) — verificabile in test con il client email mockato
      (assert sulla chiamata).
- [x] Finché `User.emailVerified` è `false`, un tentativo di login per
      quell'utente restituisce un errore esplicito (non genera sessione) —
      verificabile chiamando l'endpoint di sign-in in test e osservando che non
      viene emesso alcun cookie di sessione.
- [x] Cliccando il link ricevuto via email, `emailVerified` passa a `true`
      (verificabile via `GET /api/profile`, che già espone il campo,
      `src/app/api/profile/route.ts`) e da quel momento il login con le stesse
      credenziali ha successo.
- [x] Dalla schermata "verifica la tua email" l'utente può richiedere un nuovo
      invio, con feedback di successo in italiano; un secondo click sul link già
      usato/scaduto non deve mandare in errore non gestito la UI.
- [x] Il messaggio di login per un utente non verificato è distinguibile (in
      italiano) da un errore di credenziali sbagliate.
- [x] `bun run test:run`, `bun run type-check`, `bun run lint` verdi (o eventuali
      scostamenti pre-esistenti documentati nel Log col confronto vs `main`, come
      da `.task/README.md` §6).

## Artifacts

files_modified:

- src/lib/auth.ts (`requireEmailVerification` + blocco `emailVerification`)
- src/lib/email/verificationEmail.ts (nuovo, riusa `src/lib/email/client.ts` del task 046)
- src/lib/email/verificationEmail.test.ts (nuovo)
- src/lib/auth-client.ts (export `sendVerificationEmail`)
- src/lib/auth.test.ts (wiring config)
- src/app/api/login/route.ts (propaga `error.body.code` come `details`)
- src/app/api/login/**tests**/route.test.ts
- src/app/api/auth/**tests**/email-verification.test.ts (nuovo — integrazione HTTP reale via `auth.handler`, `@vitest-environment node` per il token JWT)
- src/components/Login/LoginAccess.tsx (`onLogin` distingue EMAIL_NOT_VERIFIED, `onRegistration` non naviga più se `token: null`, nuovo `onResendVerification`)
- src/components/Login/LoginAccess.test.tsx
- src/components/Login/Login.tsx (prop `onResendVerification` → `FormRegistration`)
- src/components/Login/FormRegistration/FormRegistration.tsx (schermata "controlla la tua email" + bottone reinvio)
- src/components/Login/FormRegistration/FormRegistration.test.tsx

decisions:

- "`autoSignInAfterVerification: true` — il click sul link crea la sessione
  lato server e reindirizza su `callbackURL` (default `/`): niente pagina
  dedicata per il passo di verifica, a differenza del reset password che
  richiede un form (Better Auth gestisce l'intero flusso su
  `/api/auth/verify-email`, fuori dal matcher del middleware)."
- "`sendOnSignIn: true` — un tentativo di login bloccato da email non
  verificata rimanda da sé un nuovo link: copre 'ho perso la prima email' per
  un utente che torna a fare login, senza un bottone di resend dedicato in
  quel punto d'ingresso (il resend esplicito via UI resta comunque disponibile
  dalla schermata post-registrazione)."
- "`expiresIn` del token di verifica non impostato esplicitamente: default
  Better Auth 1.6.11 (3600s/1h), stesso ordine di grandezza del reset
  password."
- "Nessun endpoint/pagina dedicati per il resend oltre ad
  `authClient.sendVerificationEmail` (già anti-enumeration lato Better Auth)."

## Note / Log

- 2026-08-19 (owner): creato da richiesta utente, in coppia con il task 046
  (recupero password) — stessa priorità/urgenza, stesso gap architetturale
  (nessuna integrazione email in produzione). Ispezionato il codice:
  `src/lib/auth.ts` non ha alcun blocco `emailVerification`; `User.emailVerified`
  esiste già a schema (nessuna migrazione necessaria) ma oggi non è mai
  impostato da un flusso applicativo, solo dal seed (`true` hardcoded).
  `FormRegistration`/`LoginAccess.tsx` oggi portano l'utente in dashboard subito
  dopo `signUp.email`, senza alcun gate.
- 2026-08-19 (owner): dipendenza informale dal task 046 per il client email
  condiviso — vedi Scope. Non stackare il branch su quello di 046 (niente PR a
  cascata): se 046 ha una PR aperta non mergiata quando questo task viene
  dispatchato, attendere il merge in `main` prima di iniziare l'implementazione
  (`.task/README.md` §12), salvo decisione esplicita in senso contrario
  dall'utente per non bloccare l'ondata.
- 2026-09-08 (dev): implementato direttamente sul branch `task/046-recupero-
password-email` (dopo aver mergiato `main`, che nel frattempo aveva già
  portato in `main` il task 048 — refactor RHF dei form di login/registrazione
  — con cui questo task ha avuto conflitti di merge non banali, risolti
  ricostruendo `FormDemandPassword`/`FormForgotPassword` sulla nuova base RHF).
  Non esiste una PR/branch `task/047-verifica-email-registrazione` separata.
  Riusato integralmente il client email di 046 (`src/lib/email/client.ts`,
  stesse env var `BREVO_TRANSACTIONAL_API_KEY`/`BREVO_SENDER_EMAIL`), come da
  Scope.
- 2026-09-08 (dev): **ATTENZIONE PRIMA DEL MERGE IN PRODUZIONE** — `Escluso`
  sopra assume "nessuna migrazione dati necessaria" solo perché il seed imposta
  `emailVerified: true` sugli utenti demo. Non è stato verificato lo stato dei
  record **reali** in produzione: prima di questo task nessun flusso applicativo
  impostava mai `emailVerified` a `true` per un utente registrato normalmente
  (il campo non ha un `@default` a schema, Better Auth lo crea `false` di
  default), quindi è probabile che **tutti** gli utenti reali già registrati
  abbiano oggi `emailVerified: false`. Con `requireEmailVerification: true`
  attivo, al primo deploy in produzione questi utenti verrebbero bloccati in
  login finché non cliccano un link di verifica — che il codice invia loro
  automaticamente al primo tentativo di login fallito (`sendOnSignIn: true`),
  ma è comunque un cambio di comportamento silenzioso per chiunque avesse già
  un account. Da verificare (query `SELECT count(*) FROM "user" WHERE
"emailVerified" = false`) e, se il numero non è zero, valutare una migrazione
  di backfill (`UPDATE "user" SET "emailVerified" = true WHERE "createdAt" <
<data di deploy>`) prima di abilitare il flag in produzione — non inclusa in
  questo task.
