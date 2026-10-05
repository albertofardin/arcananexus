// Entry point del registry feature (T-019): importare da qui (non
// direttamente da `./registry`) garantisce che tutti gli handler si siano
// auto-registrati (side-effect import) prima che `getFeatureHandler`/
// `executeFeatureAction` vengano usati altrove (route API, seed, test
// end-to-end). Aggiungere un nuovo handler = un nuovo modulo in
// `./handlers/` + un import qui sotto.
import "./handlers/talents";
import "./handlers/deathXpRecovery";
import "./handlers/downtimeAction";
import "./handlers/missive";
import "./handlers/progress";

export * from "./types";
export * from "./registry";
export * from "./featuresName";
