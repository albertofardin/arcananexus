-- Rinomina `FeatureType.functionName`: "learnTalent" -> "talents"
-- (src/lib/features/featuresName.ts, FT_TALENTS): senza questo update le
-- campagne che avevano già attivato questa Feature la perderebbero
-- (getFeatureByFunctionName non la troverebbe più) — stesso pattern già
-- applicato in 20260813120000_talenti_missive_xp_transaction_update.
-- Allinea anche `featureName` al valore registrato nel codice
-- (`registerFeatureHandler({ featureName: "Talenti", ... })`, talents.ts):
-- la riga era stata creata dal seed quando il nome registrato era ancora
-- "Apprendi talento" — il seed non lo aggiorna mai su una riga già esistente
-- (`createFeatureType` gira solo se `getFeatureTypeByFunctionName` non trova
-- nulla), quindi la UI mostrava ancora il nome vecchio.
UPDATE "FeatureType"
SET "functionName" = 'talents', "featureName" = 'Talenti'
WHERE "functionName" = 'learnTalent';

-- Rimuove il campo legacy `requiresApproval` da Feature.featureData per la
-- Feature "talents": la coda di approvazione è stata rimossa da tempo
-- (commit fd8b504) e `talents.ts` non normalizza più questa chiave in
-- lettura — un record con ancora quella chiave farebbe fallire il parse
-- `.strict()` di `talentsFeatureSchema`.
UPDATE "Feature" f
SET "featureData" = f."featureData" - 'requiresApproval'
FROM "FeatureType" ft
WHERE f."featureTypeId" = ft.id
  AND ft."functionName" = 'talents'
  AND f."featureData" ? 'requiresApproval';
