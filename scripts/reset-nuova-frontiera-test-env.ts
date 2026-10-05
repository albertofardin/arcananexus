// Reset + ripopolamento dell'ambiente di test della campagna reale
// "Nuova Frontiera" (T-0xx, richiesta owner, DB Neon di sviluppo condiviso —
// NON un DB locale, va trattato con cautela): svuota i dati "di gioco"
// generati dai test manuali (personaggi, missive, downtime) e li ripopola
// con un set fresco e vario, senza toccare la configurazione di campagna
// (`DataType`/`ReferenceData`/`Feature`/`FeatureType`), gli `User`/`Grant`
// esistenti, né altre campagne.
//
// Uso:
//   bun run scripts/reset-nuova-frontiera-test-env.ts
//
// Idempotente per costruzione (non nel senso di "non duplica se già
// presente", come `prisma/seed-nuova-frontiera/index.ts` — qui il pattern è
// "cancella sempre tutto lo scope, poi rigenera da zero"): ogni esecuzione
// riporta la campagna a uno stato fresco e coerente, pronta per un nuovo
// giro di test manuali. Sicuro da rilanciare quante volte serve.
//
// Scope (NON tocca altro):
//   - Elimina: Action "missive" + Action "downtime" (generica FT_DOWNTIME +
//     tutte le categorie custom `downtime:<uuid>`) della campagna, poi tutti
//     i Character della campagna (cascata Prisma su Action/CharacterData/
//     XpTransaction residue, es. le Action "learnTalent").
//   - Rigenera: 28 Character (16 PG "giocatore" + 12 PNG per i 4
//     master/staff, 3 ciascuno), ognuno con razza + XP iniziale (stesso
//     meccanismo di `src/lib/seed/characterAssignment.ts`, T-025), un paio
//     di talenti su qualche PG, 100 Action missive e 100 Action downtime
//     inserite DIRETTAMENTE via Prisma (bypass del registry feature — è
//     dati di test, non simulazione di gameplay reale, vedi brief).
//
// Limite noto (da riportare all'utente): le missive "a nome del master"
// condividono un unico bucket lato dati (`Action.characterId: null`, filtro
// `MISSIVE_MASTER_ID` in `missive.repository.ts`) — non esiste oggi un
// campo che tracci QUALE dei master l'ha inviata, quindi la tab "Inviate"
// per singolo master non può distinguerle strutturalmente (quella
// differenziazione è in lavorazione su un altro branch, non ancora in
// main). Qui il "mittente" resta solo testuale (firma nel corpo del
// messaggio), non un filtro applicativo.

import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import type { Prisma, ReferenceData } from "@prisma/client";
import { prisma } from "../src/lib/db";
import { ARCANA_DOMINE_SLUG } from "../src/lib/constants";
import { FT_DOWNTIME, FT_MISSIVE } from "../src/lib/features/featuresName";
import { downtimeFeatureSchema } from "../src/lib/features/handlers/downtime";
import { getOrganizationBySlug } from "../src/lib/repositories/organization.repository";
import { getCampaignBySlug } from "../src/lib/repositories/campaign.repository";
import { listGrantsForCampaign } from "../src/lib/repositories/grant.repository";
import { listAllUsersBasic } from "../src/lib/repositories/user.repository";
import { getDataTypeByName } from "../src/lib/repositories/dataType.repository";
import { getReferenceDataByName } from "../src/lib/repositories/referenceData.repository";
import { getFeatureByFunctionName } from "../src/lib/repositories/feature.repository";
import { createCharacter } from "../src/lib/repositories/character.repository";
import {
  assignRaceWithInitialXp,
  purchaseTalent,
} from "../src/lib/seed/characterAssignment";

const CAMPAIGN_SLUG = "nuova-frontiera";

// ─────────────────────────────────────────────────────────────────────────
// Utility
// ─────────────────────────────────────────────────────────────────────────

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function pickN<T>(items: readonly T[], n: number): T[] {
  const pool = [...items];
  const out: T[] = [];
  while (out.length < n && pool.length > 0) {
    const index = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(index, 1)[0]);
  }
  return out;
}

// Data casuale negli ultimi `daysBack` giorni (mai nel futuro): usata sia
// per `creationDate` (invio) sia come base per `readDate` — vedi
// `randomReadDate` sotto — così le 200 Action generate non hanno tutte lo
// stesso istante (requisito esplicito del brief: date "distribuite su un
// intervallo plausibile non tutte identiche").
function randomPastDate(daysBack: number): Date {
  const now = Date.now();
  const past = now - Math.floor(Math.random() * daysBack * 24 * 60 * 60 * 1000);
  return new Date(past);
}

// `readDate` successiva all'invio ma mai nel futuro: `null` in ~45% dei casi
// (mix "letta/non letta" richiesto dal brief).
function randomReadDate(sendDate: Date): Date | null {
  if (Math.random() < 0.45) return null;
  const now = Date.now();
  const maxDelayMs = Math.max(1, now - sendDate.getTime());
  const delay = Math.floor(Math.random() * maxDelayMs);
  return new Date(sendDate.getTime() + delay);
}

// Path root-relative servito da Next.js da `public/`, con URL-encode di
// ogni segmento (la cartella mock ha spazi nel nome, vedi brief).
function avatarUrl(category: "PG" | "PNG", fileName: string): string {
  return [
    "",
    encodeURIComponent("characters avatar mock"),
    encodeURIComponent(category),
    encodeURIComponent(fileName),
  ].join("/");
}

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");

function listAvatarFiles(category: "PG" | "PNG"): string[] {
  const dir = path.join(
    REPO_ROOT,
    "public",
    "characters avatar mock",
    category
  );
  return fs
    .readdirSync(dir)
    .filter(name => name.toLowerCase().endsWith(".png"))
    .sort();
}

// ─────────────────────────────────────────────────────────────────────────
// Contenuto — personaggi (T-0xx: tono fantasy coerente con l'ambientazione
// "Anki", cap. esplorazione/colonizzazione, fazioni, magia, fede,
// diplomazia, conflitti — vedi il catalogo reale importato da
// `prisma/seed-nuova-frontiera/index.ts`: razze Umano/Nano/Elfo/Orco/
// Furore/Sirenide, fazioni Il Collettivo/Eleftheria/Stjarnor/Rugterra/
// Aibelir, divinità Veive e altre).
// ─────────────────────────────────────────────────────────────────────────

interface PgProfile {
  name: string;
  raceName: string;
  background: string;
}

// 16 PG, un profilo per ciascuno dei 16 utenti senza Grant su questa
// campagna (vedi `main`). Razze distribuite su tutte e 6 quelle importate.
const PG_PROFILES: PgProfile[] = [
  {
    name: "Sirvan Hoth",
    raceName: "Umano",
    background:
      "Cartografo dell'avanguardia di colonizzazione di Rugterra, Sirvan " +
      "traccia le prime mappe affidabili dell'entroterra di Anki — ogni " +
      "sentiero segnato è una vita risparmiata alle carovane che seguiranno.",
  },
  {
    name: "Brenna Duskwalker",
    raceName: "Elfo",
    background:
      "Emissaria cresciuta tra i boschi ancestrali, Brenna fa da mediatrice " +
      "fra gli spiriti della foresta e i coloni che ne bruciano i margini per " +
      "farne campi — un equilibrio che sente scivolarle di mano ogni stagione.",
  },
  {
    name: "Thrain Karak",
    raceName: "Nano",
    background:
      "Ingegnere delle fortificazioni di frontiera per conto di Aibelir, " +
      "Thrain non crede nei confini disegnati sulla carta finché non sono " +
      "pietra, calce e un buon numero di sentinelle sopra le mura.",
  },
  {
    name: "Vaelith Sorn",
    raceName: "Sirenide",
    background:
      "Navigatrice delle correnti sommerse di Anki, Vaelith ha guidato le " +
      "prime flotte lungo coste che nessuna mappa umana osava disegnare — " +
      "un debito che la Corona non ha ancora saldato del tutto.",
  },
  {
    name: "Grishnak Uld",
    raceName: "Orco",
    background:
      "Ex razziatore riconvertito in capitano di scorta, Grishnak protegge " +
      "le carovane che attraversano le terre contese — non per fede in " +
      "Eleftheria, ma perché un contratto onorato paga meglio di un saccheggio.",
  },
  {
    name: "Kaelen Ashworth",
    raceName: "Umano",
    background:
      "Funzionario del Collettivo distaccato sulla frontiera, Kaelen " +
      "cataloga risorse e popolazioni con la stessa cura burocratica con cui " +
      "altri catalogano reliquie — convinto che i numeri, alla fine, vincano.",
  },
  {
    name: "Ithra Moonshade",
    raceName: "Elfo",
    background:
      "Druida che considera la colonizzazione di Anki una ferita aperta, " +
      "Ithra cammina fra gli accampamenti dei nuovi arrivati cercando di " +
      "insegnare loro a chiedere, non a prendere.",
  },
  {
    name: "Borgash Fellhand",
    raceName: "Furore",
    background:
      "La furia di Borgash è legata a uno degli antichi spiriti di Anki: " +
      "quando si scatena in battaglia, i compagni imparano presto a " +
      "restargli lontano finché la marea non si placa da sola.",
  },
  {
    name: "Dorin Emberforge",
    raceName: "Nano",
    background:
      "Fabbro devoto di Veive, Dorin forgia armi e attrezzi per gli " +
      "avamposti più esposti, convinto che ogni chiodo battuto con fede sia " +
      "una preghiera che tiene in piedi qualcosa di più della semplice legna.",
  },
  {
    name: "Sella Wavecaller",
    raceName: "Sirenide",
    background:
      "Diplomatica delle profondità, Sella negozia i diritti di pesca con " +
      "gli insediamenti costieri — un compromesso fragile che i pescatori " +
      "più impazienti minacciano di rompere ad ogni stagione.",
  },
  {
    name: "Aurelio Vantorre",
    raceName: "Umano",
    background:
      "Esploratore al soldo di Stjarnor, Aurelio mappa le correnti " +
      "magiche instabili che attraversano l'entroterra — un lavoro che ha " +
      "già consumato due compagni di viaggio e non pochi nervi.",
  },
  {
    name: "Nyra Silverfen",
    raceName: "Elfo",
    background:
      "Guaritrice negli accampamenti profughi delle scaramucce tra " +
      "fazioni, Nyra ha smesso di chiedere a chi appartiene un ferito prima " +
      "di curarlo — una scelta che le è costata più di un'amicizia.",
  },
  {
    name: "Karth Ironjaw",
    raceName: "Orco",
    background:
      "Combattente per la libertà di Eleftheria, Karth diffida " +
      "profondamente dell'espansione del Collettivo e non perde occasione " +
      "per ricordare ai nuovi coloni chi viveva su queste terre per primo.",
  },
  {
    name: "Fenwick Alder",
    raceName: "Umano",
    background:
      "Giovane chierico in missione tra gli insediamenti di frontiera, " +
      "Fenwick predica la fede in Veive con più entusiasmo che prudenza — " +
      'gli avamposti più cinici lo chiamano già "il predicatore ingenuo".',
  },
  {
    name: "Ulra Deepbrand",
    raceName: "Nano",
    background:
      "Minatrice che ha scoperto rovine sconosciute sotto la frontiera di " +
      "Anki, Ulra sa che quella scoperta vale una fortuna — e sa anche che " +
      "tenerla segreta ancora per poco sarà impossibile.",
  },
  {
    name: "Sarai Windholt",
    raceName: "Furore",
    background:
      "Ranger di confine, Sarai sorveglia le terre contese fra le fazioni " +
      "con un'attenzione quasi ossessiva — l'unica cosa che teme più di un " +
      "raid è che nessuno le creda quando arriva ad avvertirli.",
  },
];

interface PngProfile {
  name: string;
  background: string;
}

// 12 PNG, in blocchi da 3 per ciascuno dei 4 utenti con Grant (head_master/
// master/supporter) — strumenti di scena del master, senza budget XP (vedi
// commento in `main` sul perché non ricevono `assignRaceWithInitialXp`).
const PNG_PROFILES: PngProfile[] = [
  {
    name: "Magistrato Orwin Calterra",
    background:
      "Magistrato regionale del Collettivo, sovrintende alla burocrazia di " +
      "frontiera con un formalismo che infastidisce tanto i coloni quanto " +
      "le altre fazioni — ogni permesso passa dalla sua scrivania.",
  },
  {
    name: "Sacerdotessa Ismay Verel",
    background:
      "Alta sacerdotessa di Veive presso la cappella di Anki, Ismay offre " +
      "conforto e presagi ai coloni in cambio di offerte — e sa sempre " +
      "qualcosa in più di quanto lascia intendere.",
  },
  {
    name: "Capitano Vess Draor",
    background:
      "Capitano mercenario al soldo di Eleftheria, Vess vende la propria " +
      "lama a chi paga meglio nelle scaramucce di confine — la lealtà, " +
      "dice, è un lusso che la frontiera non può permettersi.",
  },
  {
    name: "Ambasciatrice Yolan Thist",
    background:
      "Inviata di Stjarnor, Yolan negozia rotte commerciali con gli " +
      "insediamenti — diplomatica quando conviene, spietata quando serve " +
      "far pesare la forza della propria fazione.",
  },
  {
    name: "Il Recluso Barrow",
    background:
      "Eremita che ricorda Anki prima della colonizzazione, Barrow vive " +
      "isolato oltre l'ultimo avamposto — chi lo cerca lo trova solo se " +
      "lui decide di farsi trovare.",
  },
  {
    name: "Comandante Ruk Hollen",
    background:
      "Comandante della guarnigione di Rugterra, Ruk applica la legge di " +
      "frontiera con pugno duro — sospetta di ogni straniero, coloni " +
      "compresi.",
  },
  {
    name: "La Contrabbandiera Wren",
    background:
      "Contrabbandiera che trafuga reliquie dalle rovine sotto Anki, Wren " +
      "conosce passaggi che nessuna mappa ufficiale riporta — un'informazione " +
      "che vende a caro prezzo.",
  },
  {
    name: "Il Profeta Cieco",
    background:
      "Oracolo errante la cui vista spenta non gli impedisce di profetizzare " +
      "il risveglio degli antichi spiriti di Anki — pochi lo ascoltano, " +
      "ancora meno gli credono.",
  },
  {
    name: "Ser Dalca Aibelir",
    background:
      "Cavaliere-diplomatico della casata Aibelir, Ser Dalca cerca alleanze " +
      "fra le fazioni di frontiera con la stessa cortesia con cui " +
      "sguainerebbe la spada, se necessario.",
  },
  {
    name: "La Strega delle Paludi",
    background:
      "Figura temuta e rispettata delle paludi meridionali, offre rimedi e " +
      "maledizioni a chi osa cercarla — i coloni evitano le sue terre, i " +
      "disperati no.",
  },
  {
    name: "Il Vecchio Rurik",
    background:
      "Veterano delle prime spedizioni, oggi tiene una locanda " +
      "all'avamposto più esposto — custodisce segreti delle guerre di " +
      "colonizzazione che pochi vorrebbero sentir raccontare.",
  },
  {
    name: "Emissario del Collettivo",
    background:
      "Funzionario ombra che monitora il dissenso fra le fazioni per conto " +
      "del Collettivo — nessuno sa davvero il suo nome, e lui preferisce " +
      "così.",
  },
];

// ─────────────────────────────────────────────────────────────────────────
// Contenuto — missive e downtime
// ─────────────────────────────────────────────────────────────────────────

const MISSIVE_OPENERS = [
  "Non ho molto tempo, quindi vengo subito al punto.",
  "Ho atteso a lungo prima di trovare il coraggio di scriverti.",
  "Che questa lettera ti trovi in salute e con la mente lucida.",
  "Le notizie che porto non sono delle migliori, ma meriti di conoscerle.",
  "Spero che questa missiva ti raggiunga prima che sia troppo tardi.",
];

const MISSIVE_BODIES = [
  "Presso il mercato di Sud Fronte si sono radunate voci inquietanti sul risveglio degli spiriti di Anki che non possiamo ignorare.",
  "Ho trovato delle prove che potrebbero cambiare gli equilibri fra le fazioni presso la Torre Grigia.",
  "Il consiglio si riunirà presto per discutere i confini contesi, e la tua presenza sarà necessaria.",
  "Una carovana di Rugterra è stata attaccata ai margini della foresta: temo non sia stato un incidente.",
  "Ho bisogno del tuo aiuto per una questione che riguarda sia la tua fazione sia la mia.",
  "I sacerdoti di Veive parlano di un segno nel cielo sopra l'avamposto: non so cosa significhi, ma mi inquieta.",
  "Eleftheria si muove lungo il confine sud: se è un'esca o una vera minaccia, non saprei dirlo.",
];

const MISSIVE_CLOSERS = [
  "Rispondimi appena puoi: non possiamo permetterci ritardi.",
  "Conto su di te, come sempre.",
  "Brucia questa lettera dopo averla letta, per prudenza.",
  "Aspetto tue notizie con impazienza.",
  "Spero di vederti presto, di persona, per parlarne con calma.",
];

function buildMissiveHtml(
  receiverName: string,
  signature: string,
  bodyOverride?: string
): string {
  const opener = pick(MISSIVE_OPENERS);
  const body = bodyOverride ?? pick(MISSIVE_BODIES);
  const closer = pick(MISSIVE_CLOSERS);
  return (
    `<p>Caro/a ${receiverName},</p>` +
    `<p>${opener}</p>` +
    `<p>${body}</p>` +
    `<p>${closer}</p>` +
    `<p>${signature}</p>`
  );
}

const MISSIVE_SUBJECTS = [
  "Notizie dal fronte",
  "Voci dal mercato",
  "Un avvertimento",
  "Richiesta d'aiuto",
  "Resoconto della missione",
  "Segnali inquietanti",
  "Questione urgente",
];

const COMMUNICATION_SUBJECTS = [
  "Avviso a tutti i coloni",
  "Editto del consiglio di Nuova Frontiera",
  "Convocazione generale",
  "Aggiornamento sulla situazione di confine",
  "Comunicato ufficiale",
];

const COMMUNICATION_BODIES = [
  "<p>Il consiglio di Nuova Frontiera informa tutti i coloni che, a partire " +
    "da questo periodo, i movimenti oltre l'ultimo avamposto dovranno essere " +
    "registrati presso il magistrato di zona.</p><p>Chiunque abbia " +
    "informazioni sul risveglio degli spiriti di Anki è invitato a riferire " +
    "senza indugio.</p>",
  "<p>Si comunica che i rappresentanti delle fazioni si riuniranno presso " +
    "l'avamposto centrale per discutere i confini contesi.</p><p>La " +
    "presenza di tutti i personaggi attivi è gradita, ma non obbligatoria.</p>",
  "<p>A causa dei recenti incidenti lungo le rotte commerciali, si " +
    "raccomanda prudenza a chiunque debba attraversare le terre contese nei " +
    "prossimi giorni.</p>",
];

const DOWNTIME_OPENERS = [
  "Con il favore dell'alba,",
  "Su indicazione di un compagno fidato,",
  "Con l'aiuto di un piccolo gruppo di fidati,",
  "Approfittando della quiete notturna,",
  "Dopo giorni di preparativi,",
  "Sfidando il malumore dei superiori,",
];

const DOWNTIME_PLACES = [
  "tra le paludi a sud del continente",
  "ai margini della foresta di Anki",
  "nella radura sacra al Bosco",
  "presso l'avamposto di Rugterra",
  "lungo le coste sorvegliate da Eleftheria",
  "nei sotterranei del vecchio forte",
  "al mercato di Sud Fronte",
  "tra le rovine sommerse vicino alla costa",
];

const DOWNTIME_MANNERS = [
  "Agisce con cautela, valutando ogni passo e cercando di non attirare attenzioni indesiderate.",
  "Procede con decisione, certo che il tempo stringa.",
  "Si muove in segreto, timoroso di essere scoperto dalle fazioni rivali.",
  "Confida nell'aiuto dei suoi alleati per portare a termine il compito.",
  "Riferisce poi l'esito solo ai più fidati.",
];

// Titoli per categoria (nomi reali delle 8 Feature attive, vedi
// `DOWNTIME_CATEGORIES` in `src/lib/features/handlers/downtimeAction.ts`):
// usati per comporre il "subject" e la frase "decide di dedicarsi a: ...".
const DOWNTIME_TITLES: Record<string, string[]> = {
  Lavorare: [
    "Addestramento delle nuove reclute",
    "Sorveglianza dell'avamposto",
    "Riparazione delle palizzate",
  ],
  Produrre: [
    "Distillazione di rimedi curativi",
    "Forgiatura di attrezzi da lavoro",
    "Conciatura delle pelli raccolte",
  ],
  Indagare: [
    "Il messaggero scomparso",
    "Voci sul risveglio degli spiriti",
    "Tracce di un sabotaggio",
  ],
  Ricercare: [
    "Genealogia della casata in esilio",
    "Antiche mappe di Anki",
    "Rituali dimenticati",
  ],
  Sabotare: [
    "Depistaggio delle pattuglie rivali",
    "Manomissione di un carico nemico",
    "Diffusione di false voci",
  ],
  Mecenatismo: [
    "Sostegno alla cappella di Veive",
    "Finanziamento della nuova locanda",
    "Patrocinio di un artigiano locale",
  ],
  Costruire: [
    "Ampliamento delle mura dell'avamposto",
    "Costruzione di un molo provvisorio",
    "Realizzazione di un rifugio di fortuna",
  ],
  Altro: [
    "Un favore non richiesto",
    "Una notte alla locanda del Vecchio Rurik",
    "Trattative informali con un contrabbandiere",
  ],
};

function buildDowntimeDescription(
  categoryName: string,
  characterName: string,
  title: string
): string {
  const opener = pick(DOWNTIME_OPENERS);
  const place = pick(DOWNTIME_PLACES);
  const manner = pick(DOWNTIME_MANNERS);
  return (
    `${opener} ${characterName} decide di dedicarsi a: "${title}" ` +
    `(${categoryName}), ${place}. ${manner}`
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🔄 Reset ambiente di test — campagna Nuova Frontiera\n");

  const organization = await getOrganizationBySlug(prisma, ARCANA_DOMINE_SLUG);
  if (!organization) {
    throw new Error(
      `Organizzazione "${ARCANA_DOMINE_SLUG}" non trovata: hai eseguito le migrazioni?`
    );
  }

  const campaign = await getCampaignBySlug(
    prisma,
    CAMPAIGN_SLUG,
    ARCANA_DOMINE_SLUG
  );
  if (!campaign) {
    throw new Error(
      `Campagna "${CAMPAIGN_SLUG}" non trovata sotto "${ARCANA_DOMINE_SLUG}": ` +
        "questo script NON la crea (è uno script di reset, non di seed)."
    );
  }
  const campaignId = campaign.id;
  console.log(
    `✓ Campagna risolta: "${campaign.name}" (id=${campaignId}, org=${organization.slug})\n`
  );

  // ── Conteggi PRIMA ──────────────────────────────────────────────────
  const before = await countCampaignData(campaignId);
  console.log("📊 Conteggi PRIMA:", before, "\n");

  // ── Fase 1: cancellazione (transazione unica) ───────────────────────
  console.log("🗑️  Cancellazione Action missive/downtime + Character...");
  const [deletedActions, deletedCharacters] = await prisma.$transaction([
    prisma.action.deleteMany({
      where: {
        feature: {
          campaignId,
          featureType: {
            OR: [{ functionName: FT_MISSIVE }, { functionName: FT_DOWNTIME }],
          },
        },
      },
    }),
    prisma.character.deleteMany({ where: { campaignId } }),
  ]);
  console.log(
    `  ✓ ${deletedActions.count} Action eliminate (missive + downtime, ` +
      "prima della cascata sui Character)"
  );
  console.log(
    `  ✓ ${deletedCharacters.count} Character eliminati (cascata su Action ` +
      "residue tipo learnTalent, CharacterData, XpTransaction)"
  );

  // ── Verifica DOPO cancellazione ─────────────────────────────────────
  const afterDelete = await countCampaignData(campaignId);
  console.log("\n📊 Conteggi DOPO cancellazione:", afterDelete);
  if (
    afterDelete.characters !== 0 ||
    afterDelete.missiveActions !== 0 ||
    afterDelete.downtimeActions !== 0 ||
    afterDelete.learnTalentActions !== 0
  ) {
    throw new Error(
      "Cancellazione incompleta: attesi tutti zero, trovato " +
        JSON.stringify(afterDelete) +
        ". Interrompo prima di rigenerare per evitare dati inconsistenti."
    );
  }
  console.log("  ✓ Tutti i conteggi a zero, come atteso.\n");

  // ── Fase 2: rigenerazione personaggi ────────────────────────────────
  console.log("👥 Rigenerazione personaggi...");

  const grants = await listGrantsForCampaign(prisma, campaignId);
  const grantUserIds = new Set(grants.map(g => g.userId));
  const allUsers = await listAllUsersBasic(prisma);
  const otherUsers = allUsers
    .filter(u => !grantUserIds.has(u.id))
    .sort((a, b) => a.email.localeCompare(b.email));
  const grantUsersSorted = [...grants].sort((a, b) =>
    a.user.email.localeCompare(b.user.email)
  );

  if (otherUsers.length < PG_PROFILES.length) {
    throw new Error(
      `Attesi almeno ${PG_PROFILES.length} utenti senza Grant su questa ` +
        `campagna per generare i PG, trovati ${otherUsers.length}.`
    );
  }
  if (grantUsersSorted.length * 3 < PNG_PROFILES.length) {
    throw new Error(
      `Attesi almeno ${Math.ceil(PNG_PROFILES.length / 3)} utenti con Grant ` +
        `su questa campagna (3 PNG ciascuno), trovati ${grantUsersSorted.length}.`
    );
  }

  const pgAvatars = listAvatarFiles("PG");
  const pngAvatars = listAvatarFiles("PNG");
  if (pgAvatars.length < PG_PROFILES.length) {
    throw new Error(
      `Servono almeno ${PG_PROFILES.length} avatar PG, trovati ${pgAvatars.length}.`
    );
  }
  if (pngAvatars.length < PNG_PROFILES.length) {
    throw new Error(
      `Servono almeno ${PNG_PROFILES.length} avatar PNG, trovati ${pngAvatars.length}.`
    );
  }

  // Razze (T-025, `assignRaceWithInitialXp`): DataType "Razza" già seedato
  // da `prisma/seed-nuova-frontiera` — questo script NON lo crea, si limita
  // a leggerlo (configurazione di campagna, fuori scope, vedi brief).
  const razzaDataType = await getDataTypeByName(prisma, campaignId, "Razza");
  if (!razzaDataType) {
    throw new Error(
      'DataType "Razza" non trovato su questa campagna: esegui prima ' +
        "`bunx prisma db seed` (importa il catalogo Nuova Frontiera)."
    );
  }
  const raceNames = [...new Set(PG_PROFILES.map(p => p.raceName))];
  const racesByName = new Map<string, ReferenceData>();
  for (const raceName of raceNames) {
    const race = await getReferenceDataByName(
      prisma,
      razzaDataType.id,
      raceName
    );
    if (!race) {
      throw new Error(`Razza "${raceName}" non trovata su questa campagna.`);
    }
    racesByName.set(raceName, race);
  }

  // Talenti (T-041, opzionali — "se non esistono NON crearne"): letti per
  // nome, best-effort. Se il catalogo talenti dovesse cambiare, lo script
  // logga un avviso e prosegue senza assegnarli, invece di fallire.
  const talentiDataType = await getDataTypeByName(
    prisma,
    campaignId,
    "Talenti"
  );
  async function findTalent(name: string): Promise<ReferenceData | null> {
    if (!talentiDataType) return null;
    return getReferenceDataByName(prisma, talentiDataType.id, name);
  }
  const talentoFisico1 = await findTalent("Addestramento fisico 1");
  const talentoFisico2 = await findTalent("Addestramento fisico 2");
  const talentoRenditaBase = await findTalent("Rendita base");

  // ── 16 PG (un utente senza Grant ciascuno) ──────────────────────────
  const pgCharacters: { id: number; name: string }[] = [];
  for (let i = 0; i < PG_PROFILES.length; i++) {
    const profile = PG_PROFILES[i];
    const owner = otherUsers[i];
    const race = racesByName.get(profile.raceName);
    if (!race) throw new Error(`Razza mancante per ${profile.name}`);

    const character = await createCharacter(prisma, {
      campaignId,
      userId: owner.id,
      name: profile.name,
      type: "pg",
      background: profile.background,
      avatar: avatarUrl("PG", pgAvatars[i]),
      approvalDate: new Date(),
    });

    // Razza + grant XP iniziale, atomici (stesso pattern di
    // `prisma/seed.ts`/T-025).
    await prisma.$transaction(tx =>
      assignRaceWithInitialXp(tx, character, race)
    );

    pgCharacters.push({ id: character.id, name: character.name });
    console.log(
      `  ✓ PG creato: ${profile.name} (${profile.raceName}) → ${owner.email}`
    );
  }

  // Un paio di talenti su qualche PG (T-041, con prerequisiti rispettati):
  // il primo PG riceve la catena "Addestramento fisico 1" → "2" (prereq
  // reale), il secondo un talento semplice senza requisiti.
  if (talentoFisico1 && talentoFisico2) {
    const target = pgCharacters[0];
    await prisma.$transaction(tx => purchaseTalent(tx, target, talentoFisico1));
    await prisma.$transaction(tx => purchaseTalent(tx, target, talentoFisico2));
    console.log(
      `  ✓ Talenti assegnati a ${target.name}: Addestramento fisico 1 → 2`
    );
  } else {
    console.log(
      '  ⚠ Talenti "Addestramento fisico 1/2" non trovati, salto l\'assegnazione.'
    );
  }
  if (talentoRenditaBase) {
    const target = pgCharacters[1];
    await prisma.$transaction(tx =>
      purchaseTalent(tx, target, talentoRenditaBase)
    );
    console.log(`  ✓ Talento assegnato a ${target.name}: Rendita base`);
  }

  // ── 12 PNG (3 per ciascuno dei 4 utenti con Grant) ──────────────────
  // Nessun grant XP iniziale (`assignRaceWithInitialXp`): la razza/XP è un
  // meccanismo di creazione PG (`DataTypeAssignability.creationOnly` su
  // "Razza"), i PNG sono strumenti di scena del master senza budget XP —
  // scelta di giudizio esplicita, non un'omissione.
  const pngCharacters: { id: number; name: string }[] = [];
  for (let i = 0; i < PNG_PROFILES.length; i++) {
    const profile = PNG_PROFILES[i];
    const owner = grantUsersSorted[Math.floor(i / 3)].user;

    const character = await createCharacter(prisma, {
      campaignId,
      userId: owner.id,
      name: profile.name,
      type: "png",
      background: profile.background,
      avatar: avatarUrl("PNG", pngAvatars[i]),
      approvalDate: new Date(),
    });

    pngCharacters.push({ id: character.id, name: character.name });
    console.log(`  ✓ PNG creato: ${profile.name} → ${owner.email}`);
  }

  const allCharacters = [...pgCharacters, ...pngCharacters];
  console.log(
    `\n✓ ${pgCharacters.length} PG + ${pngCharacters.length} PNG creati (${allCharacters.length} totali).\n`
  );

  // ── Fase 3: 100 missive ──────────────────────────────────────────────
  console.log("✉️  Generazione 100 missive...");

  const missiveFeature = await getFeatureByFunctionName(
    prisma,
    campaignId,
    FT_MISSIVE
  );
  if (!missiveFeature) {
    throw new Error(
      'Feature "missive" non trovata (o disattivata) su questa campagna.'
    );
  }

  // Firme testuali per le missive "a nome del master" (T-0xx, limite noto:
  // solo testo, NON un filtro applicativo — vedi commento in testa al
  // file): i nomi reali dei 4 utenti con Grant, in ordine.
  const masterSignatures = grantUsersSorted.map(g => g.user.name);

  const missiveRows: Prisma.ActionCreateManyInput[] = [];

  // 65 dirette PG→personaggio (mittente sempre un PG reale, destinatario un
  // personaggio qualsiasi della campagna diverso dal mittente).
  for (let i = 0; i < 65; i++) {
    const sender = pick(pgCharacters);
    const receiverPool = allCharacters.filter(c => c.id !== sender.id);
    const receiver = pick(receiverPool);
    const sendDate = randomPastDate(90);
    missiveRows.push({
      characterId: sender.id,
      featureId: missiveFeature.id,
      creationDate: sendDate,
      actionData: {
        subject: `${pick(MISSIVE_SUBJECTS)} per ${receiver.name}`,
        description: buildMissiveHtml(receiver.name, sender.name),
        receiverCharacterId: receiver.id,
        readDate: toIsoOrNull(randomReadDate(sendDate)),
      },
    });
  }

  // 20 "a nome del master" (characterId: null, non comunicazione) — firmate
  // testualmente da uno dei 4 master/staff a rotazione.
  for (let i = 0; i < 20; i++) {
    const receiver = pick(pgCharacters);
    const signature = masterSignatures[i % masterSignatures.length];
    const sendDate = randomPastDate(90);
    missiveRows.push({
      characterId: null,
      featureId: missiveFeature.id,
      creationDate: sendDate,
      actionData: {
        subject: `${pick(MISSIVE_SUBJECTS)} per ${receiver.name}`,
        description: buildMissiveHtml(receiver.name, signature),
        receiverCharacterId: receiver.id,
        readDate: toIsoOrNull(randomReadDate(sendDate)),
      },
    });
  }

  // 15 Comunicazioni (characterId: null, communication: true, visibili a
  // tutti i PG attivi) — `readByCharacterIds` popolato con un sottoinsieme
  // casuale dei 16 PG, mix "letta da alcuni/da nessuno".
  for (let i = 0; i < 15; i++) {
    const signature = masterSignatures[i % masterSignatures.length];
    const readerCount = Math.floor(Math.random() * (pgCharacters.length + 1));
    const readers = pickN(pgCharacters, readerCount).map(c => c.id);
    missiveRows.push({
      characterId: null,
      featureId: missiveFeature.id,
      creationDate: randomPastDate(90),
      actionData: {
        subject: pick(COMMUNICATION_SUBJECTS),
        description: `${pick(COMMUNICATION_BODIES)}<p>— ${signature}</p>`,
        communication: true,
        readByCharacterIds: readers,
      },
    });
  }

  await prisma.action.createMany({ data: missiveRows });
  console.log(`  ✓ ${missiveRows.length} missive create.\n`);

  // ── Fase 4: 100 downtime (solo PG, sulle 8 categorie attive) ────────
  console.log("⚙️  Generazione 100 Action downtime...");

  const downtimeFeature = await getFeatureByFunctionName(
    prisma,
    campaignId,
    FT_DOWNTIME
  );
  if (!downtimeFeature) {
    throw new Error(
      "Nessuna Feature downtime attiva trovata su questa campagna."
    );
  }
  const { categories: activeDowntimeCategories } = downtimeFeatureSchema.parse(
    downtimeFeature.featureData
  );
  if (activeDowntimeCategories.length === 0) {
    throw new Error(
      "Nessuna categoria downtime configurata su questa campagna."
    );
  }
  console.log("  Categorie attive:", activeDowntimeCategories.join(", "));

  const downtimeRows: Prisma.ActionCreateManyInput[] = [];
  for (let i = 0; i < 100; i++) {
    const categoryName =
      activeDowntimeCategories[i % activeDowntimeCategories.length];
    const titles = DOWNTIME_TITLES[categoryName] ?? DOWNTIME_TITLES.Altro;
    const title = pick(titles);
    const character = pick(pgCharacters);

    downtimeRows.push({
      characterId: character.id,
      featureId: downtimeFeature.id,
      creationDate: randomPastDate(90),
      actionData: {
        category: categoryName,
        subject: title,
        description: buildDowntimeDescription(
          categoryName,
          character.name,
          title
        ),
      },
    });
  }

  await prisma.action.createMany({ data: downtimeRows });
  console.log(`  ✓ ${downtimeRows.length} Action downtime create.\n`);

  // ── Conteggi DOPO rigenerazione ──────────────────────────────────────
  const after = await countCampaignData(campaignId);
  console.log("📊 Conteggi DOPO rigenerazione:", after);

  console.log("\n🎉 Reset ambiente di test completato.");
}

function toIsoOrNull(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

interface CampaignDataCounts {
  characters: number;
  pgCount: number;
  pngCount: number;
  missiveActions: number;
  downtimeActions: number;
  learnTalentActions: number;
}

async function countCampaignData(
  campaignId: number
): Promise<CampaignDataCounts> {
  const [
    characters,
    pgCount,
    pngCount,
    missiveActions,
    downtimeActions,
    learnTalentActions,
  ] = await Promise.all([
    prisma.character.count({ where: { campaignId } }),
    prisma.character.count({ where: { campaignId, type: "pg" } }),
    prisma.character.count({ where: { campaignId, type: "png" } }),
    prisma.action.count({
      where: {
        feature: { campaignId, featureType: { functionName: FT_MISSIVE } },
      },
    }),
    prisma.action.count({
      where: {
        feature: { campaignId, featureType: { functionName: FT_DOWNTIME } },
      },
    }),
    prisma.action.count({
      where: {
        feature: { campaignId, featureType: { functionName: "learnTalent" } },
      },
    }),
  ]);
  return {
    characters,
    pgCount,
    pngCount,
    missiveActions,
    downtimeActions,
    learnTalentActions,
  };
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async e => {
    console.error("\n❌ Reset fallito:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
