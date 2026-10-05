---
id: "024"
title: "Import dati campagna dal sito legacy"
status: backlog
priority: P2
assignee: ""
branch: ""
base: main
trello: ""
created: 2026-07-13
updated: 2026-07-13
---

## Obiettivo

Importare le campagne esistenti dal sito attuale nel nuovo metamodel, usando
`externalId` (su `ReferenceData` e `CharacterData`) per idempotenza e tracciabilità.

## Scope

Incluso (bozza):

- Mapping schema legacy → `DataType` / `ReferenceData` / `CharacterData` /
  `DataRequirement` (+ eventuale saldo XP iniziale via `XpTransaction`).
- Script di import idempotente (upsert su `externalId`) + report voci
  importate/saltate.

Escluso:

- Definizione precisa del mapping finché non sono noti formato/accesso ai dati legacy.

## Criteri di accettazione

- [ ] Import idempotente su `externalId`; un rilancio non duplica.
- [ ] Report delle voci importate/saltate.

## Artifacts

_(da compilare dal dev)_

## Note / Log

- 2026-07-13 (owner): `backlog` finché non sono noti formato/accesso dei dati legacy.
  Dipende da T-016. Sollevato dall'utente: "alcune campagne verranno migrate dal sito
  attuale".
- 2026-07-13 (owner): redesign — mapping su modello split; `externalId` su
  `ReferenceData`/`CharacterData`.
