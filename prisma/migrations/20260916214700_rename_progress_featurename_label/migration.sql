-- Rinomina l'etichetta mostrata all'utente per la feature "progress" da
-- "Progressione PG" a "Progressi" (solo la label, nessun cambio di
-- comportamento).
UPDATE "FeatureType"
SET "featureName" = 'Progressi'
WHERE "functionName" = 'progress';
