import { randomUUID } from "crypto";

// Convenzione di naming condivisa da tutti gli upload UploadThing del
// progetto: `<scope>-<tipo>-<timestamp>-<idUnivoco>.<estensione>`, per
// riconoscere a colpo d'occhio nella dashboard UploadThing a quale
// campagna/ambito appartiene ogni file (`scope` = slug campagna, o
// "profilo" per gli avatar utente non legati a una campagna) — propedeutico
// a un'eventuale futura pulizia bulk per campagna (fuori scope qui: solo
// naming). Il timestamp (`Date.now()`, millisecondi Unix) non serve
// all'unicità (già garantita da `uniqueId`), è solo per poter ordinare/
// leggere a occhio quando un file è stato caricato.
export function buildUploadedFileName(
  scope: string,
  type: string,
  extension: string
): string {
  const uniqueId = randomUUID().replace(/-/g, "").slice(0, 12);
  return `${scope}-${type}-${Date.now()}-${uniqueId}.${extension}`;
}
