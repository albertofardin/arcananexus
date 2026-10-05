-- La FeatureType "pgProgression" era stata catalogata (auto-provisioning via
-- `ensureFeatureTypesRegistered`, o dalla migration di cleanup precedente
-- 20260916181445) con uno snapshot JSON del suo `featureSchema` ancora
-- allineato al vecchio nome di campo `recoveryPercentage`. Il codice usa già
-- `deathXpRecoveryPercentage` (vedi `pgProgression.schema.ts`), ma
-- `createFeatureTypesIfMissing` usa `skipDuplicates: true` — non aggiorna
-- mai una riga già esistente. Fix: riscrive lo snapshot con il nome corretto.
UPDATE "FeatureType"
SET
  "actionSchema" = '{"$schema":"https://json-schema.org/draft/2020-12/schema","oneOf":[{"type":"object","properties":{"referenceDataId":{"type":"integer","exclusiveMinimum":0,"maximum":9007199254740991},"kind":{"type":"string","const":"talent"}},"required":["referenceDataId","kind"],"additionalProperties":false},{"type":"object","properties":{"deceasedCharacterId":{"type":"integer","exclusiveMinimum":0,"maximum":9007199254740991},"kind":{"type":"string","const":"deathXpRecovery"}},"required":["deceasedCharacterId","kind"],"additionalProperties":false}]}'::jsonb,
  "featureSchema" = '{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","properties":{"talentsEnabled":{"default":false,"title":"Talenti abilitati","type":"boolean"},"progressionMode":{"default":"xp","title":"Modalità di progressione del personaggio","type":"string","enum":["xp","stats"]},"deathXpRecoveryEnabled":{"default":false,"title":"Recupero XP alla morte abilitato","type":"boolean"},"deathXpRecoveryPercentage":{"default":0,"title":"Percentuale di XP disponibile del PG defunto recuperata dal successore","type":"number","minimum":0,"maximum":100}},"required":["talentsEnabled","progressionMode","deathXpRecoveryEnabled","deathXpRecoveryPercentage"],"additionalProperties":false}'::jsonb
WHERE "functionName" = 'pgProgression';
