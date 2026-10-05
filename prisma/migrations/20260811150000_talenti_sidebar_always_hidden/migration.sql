-- T-046 (round 2): "Talenti" (kind = 'talent') non deve mai comparire nella
-- sidebar generica, in nessuna campagna. Prima di questa migration
-- `TALENTI_DATA_TYPE_DEFAULTS.sidebarShow` era `true` (toggle esposto al
-- campaign master in `ManagerTalents.tsx`, ora rimosso): le campagne già
-- create in DB possono quindi avere ancora `sidebarShow = true` su questa
-- riga. Data migration, nessun cambio di schema.

UPDATE "DataType" SET "sidebarShow" = false WHERE "kind" = 'talent';
