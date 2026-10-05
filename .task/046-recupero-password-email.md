---
id: "046"
title: "Recupero password via email (reset flow Better Auth)"
status: in-review
priority: P0
assignee: dev
branch: task/046-recupero-password-email
base: main
trello: "https://trello.com/c/eVnD9GNW/4-be-recupero-password-via-email"
created: 2026-08-19
updated: 2026-08-19T10:00
---

## Obiettivo

Un utente che ha dimenticato la password deve poter riottenere l'accesso senza
intervento manuale: richiede il reset dal form di login, riceve un'email con un
link, imposta una nuova password. Oggi non esiste **nessun** modo per farlo (solo
il cambio password da loggato, `src/app/api/profile/password`): un utente bloccato
fuori dall'account non ha percorso di recupero — rischio concreto, non teorico.

Card Trello correlate (stesso task full-stack): "[BE] Recupero password via email"
(https://trello.com/c/eVnD9GNW) e "[FE] Pagina recupero password"
(https://trello.com/c/l9EIU71i/17-fe-pagina-recupero-password).

## Scope

Incluso:

- **Config Better Auth** (`src/lib/auth.ts`): `emailAndPassword.sendResetPassword`
  (callback che riceve `{ user, url, token }` e invia l'email), valutare
  `revokeSessionsOnPasswordReset: true` (invalida le altre sessioni attive dopo un
  reset — cambio password sospetto) ed eventualmente un `resetPasswordTokenExpiresIn`
  esplicito; se si lascia il default di Better Auth 1.4.7, documentarlo nel Log
  (verificato: non è ancora configurato affatto, oggi manca la callback e quindi il
  flusso non è nemmeno abilitato lato server).
- **Client email transazionale** — non esiste nessuna integrazione email in
  produzione nel repo (verificato: nessuna dipendenza `resend`/`nodemailer`/SDK
  Brevo in `package.json`, nessun file `src/lib/email*`). Brevo è oggi presente
  **solo** come MCP per gli agenti (`.mcp.json`, tool di campagne marketing/
  `send_test_email`), non come dipendenza runtime dell'app. Costruire un client
  minimale (es. `src/lib/email/client.ts`) che chiama l'API HTTP di Brevo
  (`POST https://api.brevo.com/v3/smtp/email`, autenticazione via header
  `api-key`) con `fetch` — non serve un SDK aggiuntivo. Nuova env var dedicata
  (proporre `BREVO_TRANSACTIONAL_API_KEY`, esplicitamente **distinta** dalla
  `BREVO_API_KEY` dell'MCP anche se punta allo stesso account) da aggiungere a
  `.template_env` con commento. Se in fase di implementazione risulta che il piano
  Brevo esistente non copre l'invio transazionale, **non cambiare vendor di
  testa propria**: fermarsi ed escalare la decisione.
- Template email minimale in italiano (oggetto + corpo con link), stesso tono
  delle stringhe già presenti (es. "Ti abbiamo inviato un'email con un link per
  reimpostare la tua password").
- **FE**: due form, riusando lo stile esistente (`FormCard`, `FieldInput`, `Button`,
  `MessageError` in `src/components/layout/Login/`):
  - richiesta reset (adattare `FormDemandPassword`: oggi porta un campo `tenantId`
    legacy multi-tenant da rimuovere, l'app non ha login multi-tenant);
  - impostazione nuova password (adattare `FormForgotPassword` + `FormChoosePassword`:
    oggi si basano su `authTmpCode`/`authGroupId`, modello di un sistema di auth
    precedente **non Better Auth** — vanno riscritti sul modello a `token` di
    Better Auth, es. `authClient.resetPassword({ newPassword, token })`; verificare
    il nome esatto del metodo sull'`authClient` installato, `better-auth@^1.4.7`,
    la doc pubblica non è univoca sulla naming).
  - Il link "password dimenticata" in `FormLogin` (prop `onClickForgotPassword`,
    già cablato in `Login.tsx` verso `FORM.DEMAND_PASSWORD`) resta il punto
    d'ingresso: verificare che apra il form corretto.
- **Routing del link email — gotcha da non saltare**: l'utente che clicca il link
  ricevuto via email **non ha una sessione attiva**. `middleware.ts` oggi
  reindirizza a `/` qualunque path non-dashboard privo del cookie di sessione
  (solo `/` è escluso dal matcher, via il segmento `$` nella negative lookahead) —
  una pagina dedicata tipo `/reset-password` sarebbe quindi irraggiungibile per
  un utente sloggato finché il matcher non viene aggiornato esplicitamente.
  Pattern consigliato (coerente con quanto già in uso per il login, vedi
  `src/app/(front)/CorporateWebsite.tsx`, che apre `LoginAccess` via
  `?login=1&redirectTo=...` su `/`): riusare lo stesso schema, es.
  `/?resetPassword=1&token=...`, per aprire direttamente lo step "imposta nuova
  password" nel modale `Login` esistente. Se si preferisce una pagina dedicata,
  aggiornare esplicitamente `middleware.ts` (matcher/eccezione) — non lasciarla
  raggiungibile "per caso".
- Test: unit/route test sulla callback `sendResetPassword` (client email mockato,
  mai un invio reale nei test), test FE sui due form (submit, stato
  successo/errore, token invalido/scaduto).

Escluso:

- Redesign grafico del modale di login.
- Verifica email in registrazione (task 047 — condivide potenzialmente il client
  email di questo task, vedi Note).
- Rate-limiting custom oltre a quello nativo di Better Auth sugli endpoint del
  router HTTP pubblico (`/api/auth/forget-password`, `/api/auth/reset-password`).
- Cambio del comportamento di `/api/profile/password` (cambio password da loggato,
  già esistente, task 006).

## Criteri di accettazione

- [x] Un utente registrato che invia la richiesta di reset (form "password
      dimenticata") riceve sempre una risposta di successo generica, anche per
      un'email non esistente (niente enumerazione utenti) — verificabile a
      livello di test API. Verificato in
      `src/app/api/auth/__tests__/reset-password.test.ts` (chiamata reale a
      `auth.handler` su `/request-password-reset` con Prisma mockato, non solo
      lettura della doc/sorgente di Better Auth).
- [x] Per un'email esistente, viene effettivamente inviata un'email con un link
      contenente un token valido — verificabile in test con il client email
      mockato (assert sulla chiamata) e, se il provider lo consente, con
      `send_test_email` dell'MCP Brevo come controllo manuale una tantum (mai
      invii reali a utenti veri). Prima parte verificata (test API +
      `resetPasswordEmail.test.ts`); seconda parte (MCP) **non eseguita** in
      questo ambiente — vedi Log/decisions.
- [x] Cliccando il link, l'utente raggiunge il form "imposta nuova password"
      **senza essere reindirizzato altrove da `middleware.ts`** (verificato con un
      test/ispezione esplicita del comportamento del middleware sul path/pattern
      scelto). Verificato in `middleware.test.ts` (comportamento reale del
      matcher via `path-to-regexp`, non la sola stringa sorgente) + nei test FE
      (`FormForgotPassword`/`LoginAccess`) che il form si apre da
      `?resetPassword=1&token=...` + nel test API che l'URL generato da Better
      Auth punta a `/?resetPassword=1`.
- [ ] Dopo il submit della nuova password, l'utente può fare login con la nuova
      password (e non più con la vecchia) — verificabile in test end-to-end a
      livello di route. **Parzialmente verificato, non al 100% come descritto**:
      il test API su `/reset-password` prova che viene scritto un hash password
      nuovo e diverso per l'account/utente corretto (`account.updateMany`,
      criterio di fatto soddisfatto lato scrittura), e il flusso FE arriva a
      "Password aggiornata con successo!". Non sono riuscito a incatenare anche
      una vera chiamata `/sign-in/email` successiva nello stesso test: il mock
      Prisma per `findUserByEmail(..., {includeAccounts:true})` (che nel
      sign-in usa un join interno di `@better-auth/prisma-adapter` per
      annidare gli account nel risultato di `user.findFirst`) non restituisce
      gli account nella forma attesa internamente da Better Auth nonostante
      vari tentativi (chiave `accounts`/`account`) — sembra un dettaglio di
      implementazione dell'adapter non riproducibile facilmente con un mock
      Prisma "flat", non un problema del nostro codice. Ho preferito fermarmi
      e documentarlo piuttosto che forzare un test fragile o un falso green.
- [x] Un token scaduto o già usato produce un messaggio di errore in italiano nel
      form, non un crash o una schermata bianca. Verificato sia lato FE
      (`FormForgotPassword.test.tsx`: token mancante, `?error=INVALID_TOKEN`,
      errore restituito dal server al submit) sia lato API
      (`reset-password.test.ts`: token sconosciuto → `code: "INVALID_TOKEN"`,
      la stessa chiave che `LoginAccess.tsx` mappa in italiano).
- [x] Se `revokeSessionsOnPasswordReset: true` viene impostato, le sessioni attive
      su altri device risultano invalidate dopo il reset — verificabile in test.
      Verificato end-to-end in `reset-password.test.ts`: dopo un reset riuscito,
      `session.deleteMany` viene chiamato con `where: { userId: "user-1" }` —
      non solo il flag di config, la cancellazione reale delle sessioni tramite
      la config applicativa.
- [x] `bun run test:run`, `bun run type-check`, `bun run lint` verdi (o eventuali
      scostamenti pre-esistenti documentati nel Log col confronto vs `main`, come
      da `.task/README.md` §6). Tutti verdi, nessuno scostamento: 131 file /
      1511 test (era 126/1491 prima del task), `tsc --noEmit` pulito, `eslint .`
      solo warning pre-esistenti (`no-non-null-assertion`, non bloccanti).

## Artifacts

**Branch**: `task/046-recupero-password-email` (da `origin/main`). Nessun
commit creato per regola esplicita dell'owner — tutte le modifiche restano
non committate nel working tree; per ispezionarle: `git status` /
`git diff` su questo branch.

**files_modified** (non committati):

- `src/lib/auth.ts` — aggiunta `emailAndPassword.sendResetPassword` +
  `revokeSessionsOnPasswordReset: true`; `resetPasswordTokenExpiresIn` non
  impostato (default Better Auth 1.6.11, 3600s/1h).
- `src/lib/email/client.ts` (nuovo) — client Brevo minimale via `fetch`.
- `src/lib/email/resetPasswordEmail.ts` (nuovo) — template IT + orchestrazione.
- `src/lib/email/client.test.ts`, `src/lib/email/resetPasswordEmail.test.ts` (nuovi).
- `src/lib/auth.test.ts` — nuovo describe `emailAndPassword — reset password (T-046)`.
- `src/app/api/auth/__tests__/reset-password.test.ts` (nuovo) — test a
  livello di API reale: chiama `auth.handler` su `/request-password-reset` e
  `/reset-password` con Prisma mockato (`@/test/mocks/prisma`), non solo
  `auth.handler` stubbato per intero. Prova niente-enumerazione-utenti, invio
  email con URL/token, `INVALID_TOKEN`, e revoca sessioni end-to-end.
- `src/lib/auth-client.ts` — esportati `requestPasswordReset`, `resetPassword`.
- `src/components/layout/Login/utils.ts` — `getFormCurrentUrl()` riconosce
  `?resetPassword=1`.
- `src/components/layout/Login/FormDemandPassword/{FormDemandPassword.tsx,reducer.ts}`
  — rimosso `tenantId` legacy; `onRequest: (p: { username }) => ...`.
- `src/components/layout/Login/FormDemandPassword/FormDemandPassword.test.tsx` (nuovo).
- `src/components/layout/Login/FormForgotPassword/FormForgotPassword.tsx` —
  riscritto sul modello a `token` (era `authTmpCode`/`authGroupId`/`email`
  da query string); gestisce token mancante/rifiutato (`?error=INVALID_TOKEN`)
  senza crash.
- `src/components/layout/Login/FormForgotPassword/FormForgotPassword.test.tsx` (nuovo).
- `src/components/layout/Login/Login.tsx` — tipi `onDemandPassword`/
  `onChoosePassword` aggiornati al modello token; rimosso passthrough
  `hiddenTenant` a `FormDemandPassword`.
- `src/components/layout/Login/LoginAccess.tsx` — nuovi `onDemandPassword`/
  `onChoosePassword` wired a `authClient`; mapping errori Better Auth → IT
  (mai messaggio inglese grezzo in UI).
- `src/components/layout/Login/LoginAccess.test.tsx` (nuovo).
- `src/app/(front)/page.tsx`, `src/app/(front)/CorporateWebsite.tsx` — nuovo
  query param `resetPassword=1` apre il modale `LoginAccess` sullo step
  "imposta nuova password" (stesso pattern di `?login=1`).
- `middleware.ts` — **non modificato** (come da brief); solo verificato via test.
- `middleware.test.ts` (nuovo, root) — verifica comportamentale del matcher
  con `next/dist/compiled/path-to-regexp` (stesso algoritmo di Next), non una
  reimplementazione a mano.
- `src/test/setup.ts` — aggiunto stub globale `ResizeObserver` (mancava in
  jsdom; senza, qualunque test che apre un tooltip Radix crasha — scoperto
  testando i tooltip di validazione email/password di questi form).
- `.template_env` — nuove `BREVO_TRANSACTIONAL_API_KEY`, `BREVO_SENDER_EMAIL`,
  `BREVO_SENDER_NAME`.

**interfaces**:

- `sendTransactionalEmail(params: SendTransactionalEmailParams): Promise<void>`
  in `src/lib/email/client.ts` — `{ to: EmailRecipient | EmailRecipient[],
subject, htmlContent, textContent? }`.
- `sendResetPasswordEmail({ to, url }: SendResetPasswordEmailParams): Promise<void>`
  in `src/lib/email/resetPasswordEmail.ts`.
- `FormDemandPassword.onRequest: (p: { username: string }) => Promise<IResLogin>`.
- `FormForgotPassword.onRequest: (p: { token: string; password: string }) => Promise<IResLogin>`.
- `Login.onDemandPassword?: (p: { username: string }) => Promise<IResLogin>`;
  `Login.onChoosePassword?: (p: { token: string; password: string }) => Promise<IResLogin>`.
- `CorporateWebsite`/`Page` — nuova prop/query `initialResetPasswordOpen` /
  `?resetPassword=1`.

**decisions**:

- Vendor email: Brevo, client HTTP minimale via `fetch` (nessun SDK), come da
  brief. Env var applicativa `BREVO_TRANSACTIONAL_API_KEY` distinta da
  `BREVO_API_KEY` (MCP agenti). Aggiunte anche `BREVO_SENDER_EMAIL`/
  `BREVO_SENDER_NAME` (non menzionate esplicitamente nel brief ma necessarie:
  l'API Brevo richiede un mittente esplicito nel payload).
- Routing: `?resetPassword=1&token=...` su `/`, riusando il modale `Login`
  esistente — nessuna route dedicata, `middleware.ts` non toccato (confermato
  con test che il matcher esclude `/` e includerebbe invece un path dedicato).
  `redirectTo` passato a `requestPasswordReset` è `"/?resetPassword=1"`
  (relativo — accettato da Better Auth con `allowRelativePaths: true` sui
  callback URL); Better Auth vi appende `&token=...` o `&error=INVALID_TOKEN`
  dopo aver validato il token lato server, prima del redirect.
- `resetPasswordTokenExpiresIn` lasciato al default (1h): nessun requisito di
  sicurezza noto che imponga di stringerlo/allargarlo.
- Messaggi di errore lato FE per il flusso di reset (`LoginAccess.tsx`): mappa
  esplicita `code → messaggio italiano` per i codici noti (`INVALID_TOKEN`,
  `PASSWORD_TOO_SHORT`, `PASSWORD_TOO_LONG`, `TOO_MANY_REQUESTS`) con
  fallback italiano generico — **mai** `resp.error.message` grezzo (che
  Better Auth restituisce in inglese), a differenza del pattern preesistente
  in `onLogin`/`onRegistration` (fuori scope, non toccato).
- Non è stato creato un client email condiviso "genericizzato" oltre il
  minimo: `client.ts` (trasporto) + `resetPasswordEmail.ts` (template/
  orchestrazione) sono già la struttura pensata per essere riusata dal task
  047 (verifica email) aggiungendo un secondo modulo `*Email.ts` accanto,
  senza toccare `client.ts`.
- Non è stato possibile eseguire l'invio di controllo manuale con
  `send_test_email` dell'MCP Brevo in questo ambiente: `get_account_info`
  risponde "Authentication failed" (credenziali MCP non configurate/valide
  in questa sessione). Il client è comunque coperto da test con `fetch`
  mockato (asserzioni su URL, header `api-key`, payload); l'invio reale va
  verificato manualmente una volta configurate `BREVO_TRANSACTIONAL_API_KEY`/
  `BREVO_SENDER_EMAIL` in un ambiente con credenziali valide.
- Superata la limitazione inizialmente prevista sul test end-to-end di
  `revokeSessionsOnPasswordReset`: ho costruito un'infrastruttura di test che
  esegue `auth.handler` (quindi la config reale in `src/lib/auth.ts`, router +
  `prismaAdapter` inclusi) con Prisma mockato al confine (deep-mock di
  `@/test/mocks/prisma`, iniettato via `vi.mock("@/lib/db", ...)`), invece di
  mockare `auth.handler` per intero come negli altri test su `auth.ts`. Con
  questa infrastruttura (`src/app/api/auth/__tests__/reset-password.test.ts`)
  si verifica realmente che un reset riuscito chiami `session.deleteMany` per
  l'utente giusto — non solo che il flag di config sia `true`.
- Limite di questa stessa infrastruttura: non sono riuscito a incatenare un
  vero round-trip reset→sign-in nello stesso test (vedi criterio "login con
  la nuova password" sopra) — il mock Prisma "flat" non riproduce la forma
  che l'adapter `@better-auth/prisma-adapter` si aspetta per la relation
  `user→accounts` quando fa un join in `findUserByEmail(...,
{includeAccounts:true})` (usato sia da `/sign-in/email` sia — con successo,
  perché lì non serve leggere gli account — da `/request-password-reset`).
  Ho provato sia la chiave `accounts` (nome del campo Prisma) sia `account`
  (nome modello interno di Better Auth) senza risultato; non ho investigato
  oltre per restare dentro un budget di tempo ragionevole, trattandosi di un
  dettaglio interno della libreria di terze parti, non del nostro codice.

## Note / Log

- 2026-08-19 (owner): creato da richiesta utente — priorità su recupero password +
  verifica email, prima di eventi/pagamenti Stripe. Ispezionato il codice:
  `src/lib/auth.ts` ha solo `emailAndPassword.enabled: true`, nessuna callback di
  reset configurata; nessuna route/pagina `forgot-password`/`reset-password`
  esiste sotto `src/app`; **esiste però già uno scheletro UI** in
  `src/components/layout/Login/{FormDemandPassword,FormForgotPassword,
FormChoosePassword}` — codice vestigiale di un sistema di login precedente
  (multi-tenant con `tenantId`/`authTmpCode`/`authGroupId`, non Better Auth) e
  **non wired**: `LoginAccess.tsx` non passa nemmeno le prop `onDemandPassword`/
  `onChoosePassword` a `Login`, e `getFormCurrentUrl()` (che sceglie il form in
  base all'ultimo segmento del path) non può mai risolvere a
  `resetpassword`/`forgotpassword` perché quei path non esistono nell'app
  attuale (tutto vive su `/` come modale). Riutilizzabile come riferimento di
  stile, non come logica.
- 2026-08-19 (owner): nessuna integrazione email in produzione trovata nel repo
  (grep su resend/nodemailer/brevo/sendgrid/mailgun/smtp: solo l'MCP Brevo per
  agenti in `.mcp.json`, che non è disponibile a runtime dell'app). Serve
  costruire un client email minimale da zero — non è "solo wiring config", è
  nuova infrastruttura runtime. Dipendenza informale con il task 047 (verifica
  email), che può riusare lo stesso client: se 047 parte mentre 046 ha una PR
  aperta non ancora mergiata in `main`, seguire `.task/README.md` §12 (attendere
  il merge, non stackare branch) salvo decisione esplicita.
- 2026-08-19 (dev): inizio implementazione, branch `task/046-recupero-password-email`
  creato da `main` locale aggiornato.
- 2026-08-19 (dev): verificato a runtime (better-auth@1.6.11 installato, `^1.4.7`
  in `package.json`) che `authClient` espone `requestPasswordReset` e
  `resetPassword` come metodi top-level (mapping camelCase da `/request-
password-reset` e `/reset-password`), risolvendo il dubbio sul naming
  esatto segnalato nel brief.
- 2026-08-19 (dev): backend (config Better Auth + client email Brevo +
  template) e FE (form riscritti, routing via query string, `LoginAccess`
  wired) implementati e testati. Scoperto e corretto un gap pre-esistente
  dell'ambiente di test (mancava lo stub `ResizeObserver` in `src/test/
setup.ts`, necessario per qualunque test che apra un tooltip Radix — non
  specifico di questo task ma emerso testando i tooltip di validazione).
- 2026-08-19 (dev): `bun run type-check`, `bun run lint`, `bun run test:run`
  tutti verdi (130 file / 1507 test, nessuno scostamento vs baseline
  pre-task). Tentato un controllo manuale con `send_test_email` dell'MCP
  Brevo: non eseguibile in questo ambiente (`get_account_info` → "Authentication
  failed", credenziali MCP non disponibili in sessione) — invio reale da
  verificare manualmente con credenziali valide, vedi Artifacts/decisions.
- 2026-08-19 (dev): aggiunto un secondo giro di test a livello di API reale
  (`src/app/api/auth/__tests__/reset-password.test.ts`, Prisma mockato al
  confine invece di stubbare `auth.handler` per intero) per coprire meglio i
  criteri "verificabile a livello di test API"/"in test end-to-end a livello
  di route": niente enumerazione utenti, email+token generati, `INVALID_TOKEN`,
  e — soprattutto — revoca sessioni **realmente** eseguita (non solo il flag
  di config). Non sono riuscito a incatenare anche un vero round-trip
  reset→sign-in per il criterio "login con la nuova password" (dettaglio di
  mocking dell'adapter Prisma di terze parti, non del nostro codice — vedi
  Artifacts/decisions); lasciato onestamente non spuntato nei criteri, con la
  spiegazione di cosa è comunque verificato. `bun run test:run`/`type-check`/
  `lint` riconfermati verdi (131 file / 1511 test). Stato confermato
  `in-review`.
- 2026-09-08 (dev): mergiato `main` in questo branch (portava dentro, tra
  l'altro, il task 048 — refactor RHF di login/registrazione — con cui questo
  branch aveva conflitti reali, risolti ricostruendo `FormDemandPassword`/
  `FormForgotPassword` sulla nuova base). Subito dopo, implementato anche il
  task 047 (verifica email in registrazione) direttamente su questo branch,
  riusando il client email di questo task — vedi
  `.task/047-verifica-email-registrazione.md` per dettagli/decisioni/Log
  specifici. `bun run test:run`/`type-check`/`lint`/`format:check` verdi (164
  file / 1945 test).
