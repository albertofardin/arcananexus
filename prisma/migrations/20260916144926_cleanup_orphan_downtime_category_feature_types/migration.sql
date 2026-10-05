-- Rimuove le `FeatureType` orfane delle vecchie categorie downtime (T-0xx,
-- fix catalogo globale): dal refactor che ha spostato le categorie downtime
-- da "una FeatureType/Feature dedicata per categoria" a un semplice
-- `categories: string[]` dentro `featureData` del contenitore `FT_DOWNTIME`,
-- nessun codice registra più questi `functionName` nel registry
-- (`src/lib/features/registry.ts`), quindi non risultano più raggiungibili
-- da `getFeatureHandler`/`ensureFeatureTypesRegistered` — righe morte nel
-- catalogo platform-wide.
--
-- Cancella:
--   - le 8 categorie statiche del regolamento (downtimeWork, downtimeProduce,
--     downtimeInvestigate, downtimeResearch, downtimeSabotage,
--     downtimePatronage, downtimeBuild, downtimeOther);
--   - ogni categoria custom di campagna (`downtime:<uuid>`, creata dal vecchio
--     flusso "Aggiungi categoria" in ModalFeatureDowntime).
--
-- A cascata (`ON DELETE CASCADE`, vedi FK in
-- 20251123140603_extended_model/migration.sql): cancella anche le `Feature`
-- per-campagna agganciate a queste `FeatureType` e le `Action` (le vecchie
-- dichiarazioni downtime, pre-refactor) agganciate a quelle `Feature`.
-- `CharacterData.actionId`/`XpTransaction.actionId` sono `ON DELETE SET
-- NULL`, quindi non vengono mai cancellate a loro volta: solo il loro
-- collegamento all'azione (mai usato per il downtime, che non crea
-- `CharacterData` e non passa da `XpTransaction` per il costo in punti)
-- torna `NULL`.
DELETE FROM "FeatureType"
WHERE "functionName" LIKE 'downtime:%'
   OR "functionName" IN (
     'downtimeWork',
     'downtimeProduce',
     'downtimeInvestigate',
     'downtimeResearch',
     'downtimeSabotage',
     'downtimePatronage',
     'downtimeBuild',
     'downtimeOther'
   );
