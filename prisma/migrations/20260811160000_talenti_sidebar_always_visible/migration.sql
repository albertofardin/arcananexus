-- T-046 (round 3): inverte la migration di round 2
-- (20260811150000_talenti_sidebar_always_hidden). "Talenti" (kind = 'talent')
-- deve invece restare sempre visibile nella sidebar, in ogni campagna, senza
-- possibilità di nasconderlo: `TALENTI_DATA_TYPE_DEFAULTS.sidebarShow` è
-- tornato `true` e il guard applicativo in
-- `data-types/[dataTypeId]/route.ts` ora blocca chi prova a impostarlo a
-- `false`, non più il contrario. Le campagne già create in DB possono avere
-- ancora `sidebarShow = false` su questa riga (round 2). Data migration,
-- nessun cambio di schema.

UPDATE "DataType" SET "sidebarShow" = true WHERE "kind" = 'talent';
