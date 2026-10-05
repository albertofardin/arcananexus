import { resetFeaturePoints } from "../resetFeaturePoints";
import { missiveFeatureSchema } from "@/lib/features/handlers/missive";
import { FT_MISSIVE } from "@/lib/features/featuresName";

// Reset punti missive (master/head_master): riporta il saldo
// `missivePoints` di ogni personaggio *attivo* della campagna al massimo
// configurato nella feature "Missive" (`maxPerEvent`) — set assoluto, stesso
// principio del reset downtime gemello (`downtime-reset/route.ts`).
export const POST = resetFeaturePoints({
  functionName: FT_MISSIVE,
  schema: missiveFeatureSchema,
  field: "missivePoints",
  getMax: data => data.maxPerEvent,
  getBonuses: data => data.pointBonuses,
  notConfiguredMessage: "Feature missive non configurata per questa campagna",
  logLabel: "missive",
});
