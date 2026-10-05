---
title: "Utenti di test — Fase 1 Backend (seed dev)"
source: "prisma/seed.ts"
updated: 2026-07-08
---

# Utenti di test — riferimento unico

Questo file è il riferimento **unico e stabile** per le persone di test usate
dai 13 test manuali di `.task/qa-report-fase-1-backend.md` (sezione "Test
manuali"). Non duplicare questi dati altrove: se cambia il seed, aggiorna solo
qui.

Generate da `prisma/seed.ts` (idempotente, `bunx prisma db seed`) contro il DB
di sviluppo condiviso Neon (host `ep-aged-resonance-a9wbveya`, database
`neondb`, stesso che risulta da `.env` in questo worktree). Verificate contro
il DB reale il 2026-07-08 (vedi "Verifica reale eseguita" in fondo).

## Come loggarsi (importante: non esiste `/login`)

Non c'è una rotta `/login` dedicata (`middleware.ts` reindirizza a `/` chi non
ha il cookie di sessione, non a `/login` — questo diverge da quanto descritto
in `CLAUDE.md`, che è disallineato sul punto). Il login avviene così:

1. Apri `http://localhost:3000/` (home pubblica).
2. Clic sul pulsante **"Accedi"** nell'header (`Header` con
   `accountLabel="Accedi"`, vedi `src/app/(front)/CorporateWebsite.tsx`).
   Si apre una `Modal` (desktop) o un pannello a tutto schermo (mobile) con il
   form di login.
3. Inserisci **email** + **password** (`ArcanaDomineTest2026!` per tutte le
   persone loggabili sotto), conferma.
4. Al successo, redirect automatico a `/dashboard`.

Da lì naviga con l'URL diretto indicato in ciascun test manuale (es.
`http://localhost:3000/dashboard/campaign1/settings`).

## Password condivisa

`ArcanaDomineTest2026!` per **tutte** le persone loggabili sotto (rispetta il
minimo di 8 caratteri di default di Better Auth; nessun `minPasswordLength`
custom in `src/lib/auth.ts`).

## Routing reale (niente segmento organizzazione nell'URL)

`ARCANA_DOMINE_SLUG` è hardcoded (`src/lib/constants.ts`): tutte le rotte di
campagna sono `/dashboard/<campaignSlug>`, **mai**
`/dashboard/<org>/<campagna>`. Slug usato per la maggior parte dei test:
**`campaign1`** (campagna "Campaign 1", organizzazione `arcana-domine`, unica
organizzazione raggiungibile dalla UI oggi).

## Blocker storico (RISOLTO — T-8)

⚠️→✅ Nel giro di preparazione originario di questo seed, `bun dev` non si
avviava (`Error: You cannot use different slug names for the same dynamic
path ('campaignId' !== 'campaignSlug')`), causato dalla coesistenza di
`src/app/api/campaigns/[campaignId]/route.ts` (T-5) e
`src/app/api/campaigns/[campaignSlug]/grants/...` (T-2). **Risolto da T-8**
(`.task/008-fix-routing-campaignid-campaignslug.md`, mergiato in
`integration/fase-1-backend`), verificato tre volte indipendentemente
(dev/reviewer/owner) e **verificato una quarta volta qui dal QA** avviando
`bun dev` sul tip attuale del branch: `✓ Ready in 335ms`, nessun errore di
routing, `GET /dashboard/campaign1 → 200`, `GET /api/campaigns → 200`. I 13
test manuali sono quindi eseguibili oggi via browser reale, non solo
bypassando l'App Router come nel giro precedente.

## Nota tecnica tuttora valida: CRUD campagne one-shot in UI è mock

Confermato leggendo il codice: `/dashboard/admin/campaigns`
(`src/app/(dashboard)/dashboard/admin/campaigns/page.tsx`) passa a
`CampaignsManager` i dati letti da `src/app/_mock/campaigns.json`, non un
fetch reale — nessuna chiamata a `/api/campaigns` da quella pagina, nessun
salvataggio persistito. Il backend reale esiste (`POST /api/campaigns` in
`src/app/api/campaigns/route.ts`, supporta `type: "oneShot"`) ma non è
collegato alla UI CRUD. Per verificare che la campagna one-shot seedata sia
visibile end-to-end si usa invece la home dashboard (`/dashboard`), che legge
da `useQueryCampaigns` → `GET /api/campaigns?orgSlug=arcana-domine` (reale, non
mock): la card "Prova One-Shot" deve comparire lì per qualunque utente
loggato. Vedi test manuale #8.

## Nota tecnica: assegnazione ruoli "direttivo" in UI è a ruolo fisso

`OrgRolesManager` (`/dashboard/admin/roles`) permette di aggiungere/rimuovere
un utente dal "direttivo" con una semplice checkbox, ma **non permette di
scegliere quale ruolo esecutivo specifico** assegnare (`board` / `treasurer` /
`vice_president` / `secretary` / `president`): chi viene aggiunto riceve
sempre `associationRole: "board"` (default esplicito in
`assignDirettivoSchema`, `src/lib/validations/associationRole.ts` — commento
nel codice: "La UI attuale non permette ancora di scegliere un ruolo
esecutivo specifico... modificabile in futuro con un editor dedicato"). Non è
un bug: è un limite noto della UI attuale. Il test manuale #7 verifica quindi
l'aggiunta al direttivo con il ruolo di default `board`, non l'assegnazione
puntuale di `president` (che oggi non è possibile fare dalla UI — solo via
`PATCH` diretto sul DB o una futura API dedicata).

## Tabella persone di test

| #   | Persona (email)                               | Password                                    | Ruolo/scenario                                                                                                         | Campagna/organizzazione di riferimento     | URL di partenza                                                                | Stato di partenza (dal seed)                                                                                                                                           | Usata per test manuale #                       |
| --- | --------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 1   | `mattia@arcana.it`                            | `ArcanaDomineTest2026!`                     | Super-admin (god-mode via email hardcoded in `isSuperAdmin`, non da dati)                                              | Nessuna (nessun Grant, nessuna Membership) | `http://localhost:3000/` → Accedi                                              | Nessuna `Membership`, nessun `Grant`, `associationRole: registered`, `status: active`. User id: `Rl8oe4AGgcYkySapFeo2o5NFPeJy0xFO`                                     | **4, 5, 7**                                    |
| 2   | `headmaster.campaign1@ad.com` (Elena Bianchi) | `ArcanaDomineTest2026!`                     | Head Master di `campaign1`, quota in regola                                                                            | `campaign1` (arcana-domine)                | `/dashboard/campaign1`                                                         | `Grant` `head_master` su `campaign1`, `Membership` anno corrente presente, `associationRole: member`, `PersonalData` completo (Elena Bianchi, verificato — vedi sotto) | **3, 6 (assegna), 9, 13**                      |
| 3   | `master.campaign1@ad.com` (Marco Verdi)       | `ArcanaDomineTest2026!`                     | Master di `campaign1`, quota in regola, nessun ruolo direttivo                                                         | `campaign1` (arcana-domine)                | `/dashboard/campaign1/admin/roles` (target), `/dashboard/admin/roles` (target) | `Grant` `master` su `campaign1`, `Membership` anno corrente presente, `associationRole: member` (NON `board`/`president`/altro — target pulito per il test 7)          | **6 (target), 7 (target)**                     |
| 4   | `supporter.campaign1@ad.com` (Sara Neri)      | `ArcanaDomineTest2026!`                     | Supporter di `campaign1`, quota in regola                                                                              | `campaign1` (arcana-domine)                | `/dashboard/campaign1/settings`, `/dashboard/campaign1/admin` (+ sottorotte)   | `Grant` `supporter` su `campaign1`, `Membership` anno corrente presente (quota OK: isola il blocco T-3 dal blocco T-4), `associationRole: member`                      | **2**                                          |
| 5   | `no-quota@ad.com` (Luca Ferrari)              | `ArcanaDomineTest2026!`                     | Nessuna quota, nessun ruolo                                                                                            | Nessuna                                    | `/dashboard/campaign1`, `/dashboard/campaign1/events`                          | Nessun `Grant` su `campaign1`, nessuna `Membership` anno corrente, `associationRole: registered`, `status: active`. User id: `2TB2fkUidcIWLTjsOuguIsTy7u8lZmyt`        | **1, 4/5 (target impersonato), 10**            |
| 6   | `president@ad.com` (Paolo Colombo)            | `ArcanaDomineTest2026!`                     | Presidente (direttivo), nessun Grant/Membership                                                                        | Nessuna                                    | `/dashboard/admin/roles` (solo lettura, alternativa)                           | `associationRole: president`, nessun Grant, nessuna Membership (bypass quota via ruolo direttivo)                                                                      | **7 (nota opzionale)**                         |
| 7   | `banned.headmaster@ad.com` (Giulia Romano)    | `ArcanaDomineTest2026!`                     | Head Master `campaign1` con `status: banned`, per verificare che `banned` non introduca blocchi extra (per design T-1) | `campaign1` (arcana-domine)                | `/dashboard/campaign1` (+ sottorotte incluso `/admin`)                         | `Grant` `head_master` su `campaign1`, `Membership` anno corrente presente, `status: banned`                                                                            | extra (non numerata, copre T-1)                |
| 8   | `admin@ad.com`                                | (nessuna — non loggabile, nessun `Account`) | Utente preesistente pre-seed, head_master su tutte le campagne                                                         | Tutte e 4 le campagne originarie           | —                                                                              | `Grant` `head_master` su `campaign1`/`winter-chronicles`/`dark-prophecy`/`realm-of-shadows`, nessuna Membership anno corrente, `associationRole: registered`           | **11** (compare come utente reale senza quota) |
| 9   | `coverage.board@ad.com`                       | (nessuna — solo copertura dato)             | `associationRole: board`, non loggabile                                                                                | Nessuna                                    | —                                                                              | Nessun `Account`, stesso pattern di `admin@ad.com`                                                                                                                     | nessuno (solo copertura `AssociationRole`)     |
| 10  | `coverage.treasurer@ad.com`                   | (nessuna — solo copertura dato)             | `associationRole: treasurer`, non loggabile                                                                            | Nessuna                                    | —                                                                              | Nessun `Account`                                                                                                                                                       | nessuno (solo copertura `AssociationRole`)     |
| 11  | `coverage.vicepresident@ad.com`               | (nessuna — solo copertura dato)             | `associationRole: vice_president`, non loggabile                                                                       | Nessuna                                    | —                                                                              | Nessun `Account`                                                                                                                                                       | nessuno (solo copertura `AssociationRole`)     |
| 12  | `coverage.secretary@ad.com`                   | (nessuna — solo copertura dato)             | `associationRole: secretary`, non loggabile                                                                            | Nessuna                                    | —                                                                              | Nessun `Account`                                                                                                                                                       | nessuno (solo copertura `AssociationRole`)     |

I 4 utenti "solo copertura dato" (righe 9-12) e `admin@ad.com` (riga 8) **non
hanno password perché non hanno alcun record `Account`**: sono creati con
`prisma.user.upsert` diretto (non `auth.api.signUpEmail` come le persone
loggabili), quindi Better Auth non ha credenziali per loro — non compaiono in
nessun flusso di login reale, servono solo a garantire che i 7 valori di
`AssociationRole` esistano tutti nel dataset e (per `admin@ad.com`) a fornire
un secondo caso reale di "utente senza quota" per il test 11.

Nota sul god-mode del super-admin (righe 4/5/7 dei test manuali):
`mattia@arcana.it` non ha alcuna `Membership` né alcun `Grant` — l'accesso
completo che si osserva (bypass T-3/T-4, sezioni `/dashboard/admin/*`) dipende
**solo** dall'email hardcoded in `isSuperAdmin`
(`src/lib/authorization.ts`), non da dati di supporto.

## Copertura `AssociationRole` (7/7 valori)

`registered` → `no-quota@ad.com`, `mattia@arcana.it`, `admin@ad.com` ·
`member` → `headmaster.campaign1@ad.com`, `master.campaign1@ad.com`,
`supporter.campaign1@ad.com`, `banned.headmaster@ad.com` · `president` →
`president@ad.com` (loggabile) · `board`/`treasurer`/`vice_president`/
`secretary` → `coverage.board@ad.com`, `coverage.treasurer@ad.com`,
`coverage.vicepresident@ad.com`, `coverage.secretary@ad.com` (non loggabili).

## Impersonation: nessuna UI, solo API (correzione rispetto a `CLAUDE.md`)

`CLAUDE.md` descrive un `ImpersonationToolbar` amber in
`(dashboard)/layout.tsx` che polla `/api/admin/impersonate/status`. **Questo
componente non esiste nel codice attuale** (verificato con una ricerca
esaustiva in `src/components/` e `src/app/`: nessun file lo definisce, nessuna
pagina chiama `/api/admin/impersonate/start`). Solo il backend esiste
(`src/app/api/admin/impersonate/{start,end,status,fake}/route.ts`), non
raggiungibile da alcun bottone/toolbar reale. È un gap noto, non un bug
introdotto da questo giro di lavoro — segnalalo se non già tracciato altrove.

Finché non c'è UI, i test manuali #4/#5 si eseguono dalla console DevTools del
browser (stesso dominio, i cookie httpOnly vengono comunque inviati
automaticamente da `fetch` same-origin), **dopo** aver fatto login come
`mattia@arcana.it` dalla UI normale:

```js
// Avvia impersonation di no-quota@ad.com (test 4)
await fetch("/api/admin/impersonate/start", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ targetUserId: "2TB2fkUidcIWLTjsOuguIsTy7u8lZmyt" }),
}).then(r => r.json());

// Verifica stato
await fetch("/api/admin/impersonate/status").then(r => r.json());

// Termina impersonation (test 5)
await fetch("/api/admin/impersonate/end", { method: "POST" }).then(r =>
  r.json()
);
```

## Verifica reale eseguita (2026-07-08, QA)

- `bunx prisma migrate status` → `Database schema is up to date!` (6
  migrazioni, incluso `20260707130000_personal_data_drop_email`).
- `prisma.personalData.findUnique({ where: { userId: <headmaster.campaign1@ad.com> } })`
  → record presente e completo (Elena Bianchi, `ssn: BNCLNE85M41H501Z`,
  `address`, `dateOfBirth`, `placeOfBirth` tutti valorizzati). La nota
  condizionale del giro precedente ("solo se la migrazione è applicata,
  altrimenti va compilato durante il test") è quindi superata: il dato
  **esiste già**, il test 9 parte da un profilo pre-popolato.
- `SELECT DISTINCT role FROM "Grant"` → solo `head_master`/`master`/
  `supporter`, nessun residuo `admin`/`helper`.
- Query utenti reali senza quota (`associationRole IN ('registered','member')`
  esclude `mattia@arcana.it`, `NOT IN (SELECT "userId" FROM "Membership" WHERE
year = 2026)`) → esattamente 2 righe: `admin@ad.com` e `no-quota@ad.com`
  (nota: la tabella utente è mappata su `"user"` minuscolo — `@@map("user")`
  in `prisma/schema.prisma` — non `"User"`; una query con `"User"` fallisce
  con `relation "User" does not exist`, verificato).
- Login reale via `auth.handler` (`/api/auth/sign-in/email`): `200` per
  `mattia@arcana.it`, `headmaster.campaign1@ad.com`, `no-quota@ad.com` con
  password corretta; `401 INVALID_EMAIL_OR_PASSWORD` per `mattia@arcana.it`
  con password errata (sanity check anti-"hash sempre valido").
- `bun dev` avviato dal QA sul tip attuale: `✓ Ready in 335ms`, nessun errore
  di routing, `GET /dashboard/campaign1 → 200`, `GET /api/campaigns → 200`,
  `GET / → 200`. Confermato che `/login` **non esiste** (`404`): il login
  passa dal modal in home (vedi sopra).
