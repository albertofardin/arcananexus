-- Ritira "talents"/"deathXpRecovery" dal catalogo globale (T-0xx, fusione
-- talenti + recupero XP alla morte in "pgProgression", Opzione B): dal
-- refactor che li ha uniti sotto un solo `functionName` eseguibile, nessun
-- codice registra più questi due nel registry (`src/lib/features/registry.ts`),
-- ma le loro righe `FeatureType`/`Feature` restavano nel DB (create dal seed
-- e da test precedenti) — non rimosse automaticamente, solo non più lette
-- per il gate on/off.
--
-- A differenza del cleanup delle categorie downtime (migration
-- 20260916144926), qui alcune `Feature` possono avere `Action` storiche
-- reali agganciate (talenti davvero imparati da un giocatore): cancellarle
-- a cascata le perderebbe. Questa migration quindi MERGE, non cancella
-- soltanto:
--   1. garantisce che esista una `FeatureType` "pgProgression" (serve come
--      FK per il passo 2 — sicura anche su un ambiente che non l'ha ancora
--      mai auto-provisionata via `ensureFeatureTypesRegistered`);
--   2. per ogni `Feature` "talents"/"deathXpRecovery" esistente (qualunque
--      campagna, non solo quelle note in locale), crea o aggiorna la
--      `Feature` "pgProgression" della STESSA campagna con il sotto-toggle
--      corrispondente abilitato (stesso `active` della vecchia Feature),
--      poi ripunta le sue `Action` storiche sulla nuova `Feature` PRIMA di
--      cancellare quella vecchia (ordine che evita qualunque perdita:
--      `Action.featureId` ha `ON DELETE CASCADE`, ma a quel punto non ha
--      più righe da cancellare);
--   3. cancella le due `FeatureType` ormai orfane (nessuna `Feature` le
--      referenzia più).
--
-- Idempotente: una seconda esecuzione non troverebbe più le due
-- `FeatureType` (già cancellate) e sarebbe un no-op completo.

INSERT INTO "FeatureType" ("featureName", "functionName", "actionSchema", "featureSchema")
SELECT
  'Progressione PG',
  'pgProgression',
  '{"$schema":"https://json-schema.org/draft/2020-12/schema"}'::jsonb,
  '{"type":"object","$schema":"https://json-schema.org/draft/2020-12/schema","required":["talentsEnabled","progressionMode","deathXpRecoveryEnabled","deathXpRecoveryPercentage"],"properties":{"talentsEnabled":{"type":"boolean"},"progressionMode":{"type":"string","enum":["xp","stats"]},"deathXpRecoveryEnabled":{"type":"boolean"},"deathXpRecoveryPercentage":{"type":"number","minimum":0,"maximum":100}}}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM "FeatureType" WHERE "functionName" = 'pgProgression');

DO $$
DECLARE
  pg_progression_type_id INT;
  talents_type_id INT;
  death_xp_type_id INT;
  rec RECORD;
  pgp_feature_id INT;
  pgp_existing_data JSONB;
BEGIN
  SELECT id INTO pg_progression_type_id FROM "FeatureType" WHERE "functionName" = 'pgProgression';
  SELECT id INTO talents_type_id FROM "FeatureType" WHERE "functionName" = 'talents';
  SELECT id INTO death_xp_type_id FROM "FeatureType" WHERE "functionName" = 'deathXpRecovery';

  IF talents_type_id IS NOT NULL THEN
    FOR rec IN SELECT * FROM "Feature" WHERE "featureTypeId" = talents_type_id LOOP
      SELECT id, "featureData" INTO pgp_feature_id, pgp_existing_data FROM "Feature"
        WHERE "featureTypeId" = pg_progression_type_id AND "campaignId" = rec."campaignId";

      IF pgp_feature_id IS NULL THEN
        INSERT INTO "Feature" ("featureTypeId", "campaignId", "featureData", "active", "paused")
        VALUES (
          pg_progression_type_id,
          rec."campaignId",
          jsonb_build_object(
            'talentsEnabled', true,
            'progressionMode', 'xp',
            'deathXpRecoveryEnabled', false,
            'deathXpRecoveryPercentage', 0
          ),
          rec."active",
          false
        )
        RETURNING id INTO pgp_feature_id;
      ELSE
        UPDATE "Feature"
          SET "featureData" = pgp_existing_data || jsonb_build_object('talentsEnabled', true)
          WHERE id = pgp_feature_id;
      END IF;

      UPDATE "Action" SET "featureId" = pgp_feature_id WHERE "featureId" = rec.id;

      DELETE FROM "Feature" WHERE id = rec.id;
    END LOOP;
  END IF;

  IF death_xp_type_id IS NOT NULL THEN
    FOR rec IN SELECT * FROM "Feature" WHERE "featureTypeId" = death_xp_type_id LOOP
      SELECT id, "featureData" INTO pgp_feature_id, pgp_existing_data FROM "Feature"
        WHERE "featureTypeId" = pg_progression_type_id AND "campaignId" = rec."campaignId";

      IF pgp_feature_id IS NULL THEN
        INSERT INTO "Feature" ("featureTypeId", "campaignId", "featureData", "active", "paused")
        VALUES (
          pg_progression_type_id,
          rec."campaignId",
          jsonb_build_object(
            'talentsEnabled', false,
            'progressionMode', 'xp',
            'deathXpRecoveryEnabled', true,
            'deathXpRecoveryPercentage', COALESCE((rec."featureData"->>'recoveryPercentage')::numeric, 0)
          ),
          rec."active",
          false
        )
        RETURNING id INTO pgp_feature_id;
      ELSE
        UPDATE "Feature"
          SET "featureData" = pgp_existing_data || jsonb_build_object(
            'deathXpRecoveryEnabled', true,
            'deathXpRecoveryPercentage', COALESCE((rec."featureData"->>'recoveryPercentage')::numeric, 0)
          )
          WHERE id = pgp_feature_id;
      END IF;

      UPDATE "Action" SET "featureId" = pgp_feature_id WHERE "featureId" = rec.id;

      DELETE FROM "Feature" WHERE id = rec.id;
    END LOOP;
  END IF;

  DELETE FROM "FeatureType" WHERE "functionName" IN ('talents', 'deathXpRecovery');
END $$;
