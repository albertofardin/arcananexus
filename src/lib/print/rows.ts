import sharp from "sharp";
import type { PrismaClient } from "@prisma/client";
import { htmlToText, type PrintRow } from "./fields";
import { listCharactersForPrint } from "@/lib/repositories/character.repository";
import { listReferenceDataForPrint } from "@/lib/repositories/referenceData.repository";

// Righe di dati per la stampa (Area Stampa), calcolate lato server così le
// immagini arrivano già come data URL PNG (pdfme accetta solo PNG/JPEG e il
// client non può leggere i file UploadThing per via del CORS).

const IMAGE_MAX_PX = 800;

async function toPngDataUrl(url: string | null | undefined): Promise<string> {
  if (!url) return "";
  try {
    const res = await fetch(url);
    if (!res.ok) return "";
    const png = await sharp(Buffer.from(await res.arrayBuffer()))
      .resize(IMAGE_MAX_PX, IMAGE_MAX_PX, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .png()
      .toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    // Un file non immagine (es. PDF allegato a una voce) o irraggiungibile
    // non deve bloccare la stampa: il campo resta vuoto.
    return "";
  }
}

export async function buildCharacterRows(
  prisma: PrismaClient,
  campaignId: number,
  ids: number[]
): Promise<PrintRow[]> {
  const characters = await listCharactersForPrint(prisma, campaignId, ids);
  const byId = new Map(characters.map(c => [c.id, c]));

  return Promise.all(
    ids
      .map(id => byId.get(id))
      .filter(c => c !== undefined)
      .map(async c => {
        const byType = new Map<string, string[]>();
        for (const entry of c.characterData) {
          const names = byType.get(entry.dataType.name) ?? [];
          names.push(entry.referenceData.name);
          byType.set(entry.dataType.name, names);
        }
        return {
          ...Object.fromEntries(
            [...byType].map(([type, names]) => [type, names.join(", ")])
          ),
          Nome: c.name,
          Giocatore: c.user.name,
          Tipo: c.type === "pg" ? "PG" : "PNG",
          Avatar: await toPngDataUrl(c.avatar),
          Background: htmlToText(c.background),
          "Note pubbliche": htmlToText(c.masterPublicNotes),
        };
      })
  );
}

export async function buildReferenceRows(
  prisma: PrismaClient,
  campaignId: number,
  ids: number[]
): Promise<PrintRow[]> {
  const entries = await listReferenceDataForPrint(prisma, campaignId, ids);
  const byId = new Map(entries.map(e => [e.id, e]));

  return Promise.all(
    ids
      .map(id => byId.get(id))
      .filter(e => e !== undefined)
      .map(async e => ({
        Nome: e.name,
        Descrizione: htmlToText(e.description),
        "Tipo di dato": e.dataType.name,
        Immagine: await toPngDataUrl(e.fileUrl),
      }))
  );
}
