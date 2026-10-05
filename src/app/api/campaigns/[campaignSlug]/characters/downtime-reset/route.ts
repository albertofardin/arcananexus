import { resetFeaturePoints } from "../resetFeaturePoints";
import { downtimeFeatureSchema } from "@/lib/features/handlers/downtime";
import { FT_DOWNTIME } from "@/lib/features/featuresName";

// Reset punti downtime (master/head_master): riporta il saldo
// `downtimePoints` di ogni personaggio *attivo* della campagna al massimo
// configurato nella feature "Downtime" (`maxPoints`) — a differenza della
// ricarica post-evento (`downtime-recharge`, increment relativo) qui è un
// set assoluto, pensato per azzerare il ciclo, non per una ricarica parziale.
export const POST = resetFeaturePoints({
  functionName: FT_DOWNTIME,
  schema: downtimeFeatureSchema,
  field: "downtimePoints",
  getMax: data => data.maxPoints,
  getBonuses: data => data.pointBonuses,
  notConfiguredMessage: "Feature downtime non configurata per questa campagna",
  logLabel: "downtime",
});
