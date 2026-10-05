---
id: "051"
title: "Tesseramento e pagamenti: pagamento tessera + storico pagamenti eventi"
status: in-review
priority: P1
assignee: dev
branch: task/051-tesseramento-e-pagamenti
base: main
trello: ""
created: 2026-09-22
updated: 2026-09-22
---

## Obiettivo

Trasformare la pagina "Tessera Associativa" (sola lettura) in "Tesseramento e
pagamenti": pagamento reale della tessera annuale (10€, via PayPal, gated
dall'anagrafica completa) e visibilità di tutti i pagamenti eventi dell'anno
corrente, così nessun socio può contestare un addebito.

## Scope

Incluso: conversione della pagina a Server Component, flusso di pagamento
PayPal della tessera (register + capture, mirror del flusso eventi), elenco
pagamenti eventi dell'anno corrente, rinomina della label UI.

Escluso: rinomina della route/URL (`/dashboard/profile/membership` resta
invariata), esenzioni di pagamento per direttivo/sviluppo (non richieste),
gestione multi-anno retroattiva del pagamento tessera.

## Criteri di accettazione

- [x] La pagina `/dashboard/profile/membership` è un Server Component che
      mostra tessera anno corrente, storico, e pagamenti eventi anno
      corrente, senza fetch client-side.
- [x] Se manca la tessera dell'anno corrente, la pagina mostra il requisito
      "Anagrafica completa" e, se soddisfatto, il form di pagamento PayPal.
- [x] `POST /api/memberships/register` e `POST /api/memberships/paypal/capture`
      rivalidano sempre anagrafica completa + assenza di tessera già pagata
      per l'anno corrente, server-side.
- [x] Label "Tessera Associativa" → "Tesseramento e pagamenti" in HeroPage e
      in `profileNavItems`.
- [x] `bun run type-check`, `bun run lint`, test mirati verdi.

## Artifacts

files_modified:

- src/lib/constants.ts
- src/lib/repositories/membership.repository.ts
- src/lib/repositories/booking.repository.ts
- src/lib/validations/membership.ts
- src/app/api/memberships/register/route.ts (nuovo)
- src/app/api/memberships/paypal/capture/route.ts (nuovo)
- src/app/api/memberships/route.ts (rimosso, non più usato)
- src/app/api/memberships/**tests**/route.test.ts (rimosso)
- src/app/api/memberships/**tests**/register.test.ts (nuovo)
- src/lib/repositories/membership.repository.test.ts (nuovo)
- src/lib/repositories/booking.repository.test.ts (nuovo)
- src/components/MembershipPage/MembershipPage.tsx (nuovo)
- src/components/MembershipPage/MembershipPaymentForm.tsx (nuovo)
- src/components/MembershipPage/index.ts (nuovo)
- src/app/(dashboard)/dashboard/profile/membership/page.tsx
- src/components/SidePanel/profileNavItems.ts

interfaces:

- "createPaidMembership(prisma, { userId, year, value, paymentData }) -> Promise<Membership>"
- "listUserPaidBookingsForYear(prisma, userId, year) -> Promise<Booking[]> (con event + payment)"

decisions:

- "Pagina unica (nessun route param) -> componente singolare MembershipPage, non plurale MembershipPages come EventPages (che serve 4 varianti/route)"
- "Nessuna estrazione di un hook/componente PayPal condiviso con EventRegisterForm: solo 2 call-site con UI e payload divergenti (selezione personaggio/quota vs importo fisso), clonata la wiring minima; da rivalutare a un 3° consumer"
- "GET /api/memberships eliminata (route + test): non più usata da nessuna pagina dopo il passaggio a Server Component, nessun altro consumer trovato via grep"
- "Riusato findPaymentByPayPalOrderId di booking.repository.ts per l'idempotenza della cattura tessera (query generica su Payment, non booking-specific)"
- "Omesso enableFunding paylater nel form tessera: paga-in-3-rate non ha senso per una quota fissa da 10€"

## Note / Log

- 2026-09-22 (dev): inizio implementazione, branch task/051-tesseramento-e-pagamenti da main locale (nessun accesso remoto a origin nell'ambiente).
- 2026-09-22 (dev): implementazione completa (repository, route PayPal register+capture, MembershipPage/MembershipPaymentForm, rinomina label). `bun run format`, `bun run lint` (0 errori, 1 warning pre-esistente non correlato), `bun run type-check`, `bun run test:unit` (95 file/1152 test) e `bun run test:api` (67 file/723 test) tutti verdi. Branch: `task/051-tesseramento-e-pagamenti` (verifica: `git log main..task/051-tesseramento-e-pagamenti`). Nessun commit creato: in attesa di richiesta esplicita per il commit. Nota: il working tree del branch include anche modifiche pre-esistenti non mie, già staged su `main` prima dell'inizio del task (package-lock.json, EventPages.tsx, EventWriter.tsx, UsersManager.tsx, icon-map.ts) — non toccate, segnalate all'owner.
