-- Indice unico parziale: un solo `XpTransaction` con `reason = 'initialGrant'`
-- per personaggio. `grantInitialXp` (src/lib/services/xp.service.ts) era
-- idempotente solo a livello applicativo (`findFirst` poi `create`): due
-- chiamate concorrenti sullo stesso `characterId` potevano superare entrambe
-- il controllo prima che l'altra committasse, creando un doppio grant. Prisma
-- non rappresenta gli indici parziali nello `schema.prisma` dichiarativo,
-- quindi questo vincolo esiste solo qui (vedi commento sul modello
-- `XpTransaction` in `prisma/schema.prisma`).
CREATE UNIQUE INDEX "XpTransactionInitialGrantUnique" ON "XpTransaction"("characterId") WHERE "reason" = 'initialGrant';
