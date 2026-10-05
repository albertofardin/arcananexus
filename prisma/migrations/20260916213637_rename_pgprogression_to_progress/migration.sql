-- Rinomina il `functionName` "pgProgression" in "progress" (solo rinomina,
-- nessun cambio di comportamento): il nome tecnico non comunicava che la
-- feature copre la progressione generale del personaggio (talenti +
-- recupero XP alla morte), non solo il PG in senso stretto.
UPDATE "FeatureType"
SET "functionName" = 'progress'
WHERE "functionName" = 'pgProgression';
