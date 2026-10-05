-- Vincolo UNIQUE su `functionName` (T-019 follow-up, fix bug "feature
-- assenti su staging"): il catalogo `FeatureType` non è più popolato dal
-- seed ma da `ensureFeatureTypesRegistered` (`src/lib/features/registry.ts`),
-- chiamata ad ogni lettura del catalogo — con richieste concorrenti serve un
-- vincolo reale in DB perché `createMany(..., { skipDuplicates: true })`
-- resti idempotente (ON CONFLICT DO NOTHING). Safe: le categorie downtime
-- custom di campagna usano `functionName = "downtime:" + crypto.randomUUID()`,
-- già uniche per costruzione.
CREATE UNIQUE INDEX "FeatureType_functionName_key" ON "FeatureType"("functionName");
