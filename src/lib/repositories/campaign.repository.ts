import { cache } from "react";
import {
  CharacterType,
  type PrismaClient,
  type Campaign,
  type CampaignImage,
} from "@prisma/client";
import type {
  CreateCampaignInput,
  UpdateCampaignInput,
  UpdateCampaignLogoInput,
  UpdateCampaignCoverInput,
  CreateCampaignImageInput,
  CampaignUploadThingRefs,
  ListCampaignsOptions,
  PaginatedResult,
  CampaignWithRelations,
} from "./types";
import {
  createDataType,
  TALENTI_DATA_TYPE_DEFAULTS,
} from "./dataType.repository";

export async function getCampaignById(
  prisma: PrismaClient,
  id: number,
  organizationId?: number
): Promise<Campaign | null> {
  return prisma.campaign.findFirst({
    where: {
      id,
      ...(organizationId ? { organizationId } : {}),
    },
    include: {
      organization: true,
    },
  });
}

export const getCampaignBySlug = cache(async function getCampaignBySlug(
  prisma: PrismaClient,
  slug: string,
  orgSlug?: string
): Promise<Campaign | null> {
  const where = orgSlug
    ? {
        slug,
        organization: {
          slug: orgSlug,
        },
      }
    : {
        slug,
      };

  return prisma.campaign.findFirst({
    where,
    include: {
      organization: true,
    },
  });
});

// `visibilityFilter` governa quali campagne "nascoste" (`visibility: false`)
// entrano nel risultato: di default nessuna (`includeHidden` false), solo
// quelle su cui `userId` ha un Grant proprio (staff della campagna, a
// prescindere dal ruolo) rientrano comunque — vedi `GET /api/campaigns`, che
// passa `includeHidden: true` solo per chi è effettivamente Sviluppo Web.
export async function listCampaignsByOrgSlug(
  prisma: PrismaClient,
  orgSlug: string,
  visibilityFilter?: { userId?: string; includeHidden?: boolean }
) {
  const includeHidden = visibilityFilter?.includeHidden ?? false;
  const userId = visibilityFilter?.userId;
  return prisma.campaign.findMany({
    where: {
      organization: { slug: orgSlug },
      ...(includeHidden
        ? {}
        : {
            OR: [
              { visibility: true },
              ...(userId ? [{ grants: { some: { userId } } }] : []),
            ],
          }),
    },
    select: {
      id: true,
      name: true,
      slug: true,
      logo: true,
      cover: true,
      color: true,
      texture: true,
      visibility: true,
      dataTypes: {
        where: { sidebarShow: true },
        select: { name: true, icon: true, kind: true },
        orderBy: [
          { sidebarOrder: { sort: "asc", nulls: "last" } },
          { name: "asc" },
        ],
      },
      feature: {
        where: { active: true },
        select: {
          // `featureData` (T-0xx): serve alla route per leggere
          // `talentsEnabled` dalla `Feature` "progress" — talenti non
          // ha più una propria `Feature`, solo `active` non basta più a
          // decidere se la sezione "Talenti" va mostrata.
          featureData: true,
          featureType: { select: { functionName: true } },
        },
      },
    },
    orderBy: { name: "asc" },
  });
}

// Campagne visibili di un'organizzazione per la landing pubblica: solo i
// campi mostrati dalla griglia (`(front)/sections/Campaigns.tsx`), niente
// dataTypes/feature come in `listCampaignsByOrgSlug` (quelli servono solo
// alla dashboard).
export async function listPublicCampaigns(
  prisma: PrismaClient,
  orgSlug: string
) {
  return prisma.campaign.findMany({
    where: {
      organization: { slug: orgSlug },
      visibility: true,
    },
    select: {
      name: true,
      slug: true,
      logo: true,
      cover: true,
      color: true,
    },
    orderBy: { name: "asc" },
  });
}

// Dettaglio pubblico di una campagna (`(front)/[campaign]/page.tsx`): oltre
// ai campi di presentazione, lo staff (head_master/master/supporter, con
// nome e cognome da `PersonalData` per chi l'ha compilata) e il numero di
// PG attivi — stesso filtro "attivo" di
// `resetCampaignPointsForActiveCharacters` (non morto, non parcheggiato,
// approvato).
export async function getCampaignPublicDetails(
  prisma: PrismaClient,
  slug: string,
  orgSlug: string
) {
  return prisma.campaign.findFirst({
    where: {
      slug,
      organization: { slug: orgSlug },
      visibility: true,
    },
    select: {
      name: true,
      slug: true,
      description: true,
      logo: true,
      cover: true,
      color: true,
      texture: true,
      type: true,
      images: {
        orderBy: { order: "asc" },
        select: { id: true, url: true },
      },
      // L'ordinamento alfabetico dei valori dell'enum `Role`
      // (head_master < master < supporter) coincide con la gerarchia da
      // mostrare: nessun `orderBy` custom necessario.
      grants: {
        orderBy: [{ role: "asc" }, { user: { name: "asc" } }],
        select: {
          role: true,
          user: {
            select: {
              id: true,
              name: true,
              image: true,
              PersonalData: { select: { firstName: true, lastName: true } },
            },
          },
        },
      },
      _count: {
        select: {
          events: true,
          characters: {
            where: {
              type: CharacterType.pg,
              approvalDate: { not: null },
              deathDate: null,
              parkDate: null,
            },
          },
        },
      },
    },
  });
}

// Tutte le campagne di un'organizzazione con i grant (assegnazioni di ruolo
// staff) associati: usata dalla schermata di gestione ruoli a livello
// organizzazione (direttivo + tutte le campagne).
export async function listCampaignsWithGrants(
  prisma: PrismaClient,
  orgSlug: string
) {
  return prisma.campaign.findMany({
    where: { organization: { slug: orgSlug } },
    select: {
      id: true,
      name: true,
      slug: true,
      grants: {
        select: { userId: true, role: true },
      },
    },
    orderBy: { name: "asc" },
  });
}

export async function listCampaigns(
  prisma: PrismaClient,
  options: ListCampaignsOptions = {}
): Promise<PaginatedResult<Campaign>> {
  const {
    page = 1,
    pageSize = 20,
    organizationId,
    search,
    orderBy = "name",
    orderDirection = "asc",
  } = options;

  const skip = (page - 1) * pageSize;

  const where = {
    ...(organizationId ? { organizationId } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { description: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [data, total] = await Promise.all([
    prisma.campaign.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { [orderBy]: orderDirection },
      include: {
        organization: true,
        _count: {
          select: {
            events: true,
            characters: true,
            dataTypes: true,
          },
        },
      },
    }),
    prisma.campaign.count({ where }),
  ]);

  return {
    data,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

export async function getUserCampaigns(
  prisma: PrismaClient,
  userId: string,
  organizationId?: number
): Promise<Campaign[]> {
  return prisma.campaign.findMany({
    where: {
      ...(organizationId ? { organizationId } : {}),
      grants: {
        some: {
          userId,
        },
      },
    },
    include: {
      organization: true,
      _count: {
        select: {
          events: true,
          characters: true,
        },
      },
    },
    orderBy: {
      name: "asc",
    },
  });
}

export async function getCampaignWithDetails(
  prisma: PrismaClient,
  id: number
): Promise<CampaignWithRelations | null> {
  return prisma.campaign.findUnique({
    where: { id },
    include: {
      organization: true,
      dataTypes: {
        orderBy: { name: "asc" },
      },
      events: {
        orderBy: { dateEventStart: "desc" },
        take: 10,
      },
      characters: {
        orderBy: { creationDate: "desc" },
        take: 10,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
      grants: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
    },
  });
}

// Avvolta in `prisma.$transaction` (T-046): il DataType "Talenti" nasce
// atomicamente insieme alla campagna, con gli stessi default usati dal
// backfill/self-heal (`TALENTI_DATA_TYPE_DEFAULTS`) — nessuna campagna può
// esistere senza, nemmeno per una finestra transitoria in caso di errore a
// metà.
export async function createCampaign(
  prisma: PrismaClient,
  data: CreateCampaignInput
): Promise<Campaign> {
  return prisma.$transaction(async tx => {
    const campaign = await tx.campaign.create({
      data: {
        name: data.name,
        slug: data.slug,
        description: data.description,
        type: data.type,
        organizationId: data.organizationId,
        // Ogni campagna nasce nascosta, indipendentemente da chi la crea: va
        // resa pubblica esplicitamente da Sviluppo Web (vedi
        // updateCampaignVisibility) una volta pronta.
        visibility: false,
      },
      include: {
        organization: true,
      },
    });

    await createDataType(tx, {
      ...TALENTI_DATA_TYPE_DEFAULTS,
      campaignId: campaign.id,
    });

    return campaign;
  });
}

export async function updateCampaign(
  prisma: PrismaClient,
  id: number,
  data: UpdateCampaignInput
): Promise<Campaign> {
  return prisma.campaign.update({
    where: { id },
    data: {
      name: data.name,
      slug: data.slug,
      description: data.description,
      type: data.type,
      color: data.color,
      texture: data.texture,
    },
    include: {
      organization: true,
    },
  });
}

// Toggle visibilità (isSviluppo-only, vedi
// `/api/admin/campaigns/[campaignSlug]/visibility`).
export async function updateCampaignVisibility(
  prisma: PrismaClient,
  id: number,
  visibility: boolean
): Promise<Campaign> {
  return prisma.campaign.update({
    where: { id },
    data: { visibility },
  });
}

export async function deleteCampaign(
  prisma: PrismaClient,
  id: number
): Promise<Campaign> {
  return prisma.campaign.delete({
    where: { id },
  });
}

// Da chiamare PRIMA di `deleteCampaign`: il cascade Prisma cancella le righe
// (Campaign, CampaignImage, DataType→ReferenceData, Character) ma non i file
// su UploadThing, quindi le key vanno raccolte finché le righe esistono
// ancora. Sola lettura: la cancellazione vera e propria sullo storage è
// responsabilità del chiamante (route DELETE, in background — vedi
// `cleanupCampaignFiles` in `@/lib/campaignFileCleanup`).
export async function getCampaignUploadThingRefs(
  prisma: PrismaClient,
  campaignId: number
): Promise<CampaignUploadThingRefs> {
  const [campaign, images, referenceData, characters, actions] =
    await Promise.all([
      prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { logoKey: true, coverKey: true },
      }),
      prisma.campaignImage.findMany({
        where: { campaignId },
        select: { key: true },
      }),
      prisma.referenceData.findMany({
        where: { dataType: { campaignId } },
        select: { fileKey: true, description: true },
      }),
      prisma.character.findMany({
        where: { campaignId },
        select: { avatar: true },
      }),
      // Missive/downtime (T-0xx): `actionData` è dove vivono i campi
      // rich-text delle azioni ("Descrizione", "Risposta", ...), vedi
      // `extractUploadThingKeysFromActionData`.
      prisma.action.findMany({
        where: { feature: { campaignId } },
        select: { actionData: true },
      }),
    ]);

  return {
    logoKey: campaign?.logoKey ?? null,
    coverKey: campaign?.coverKey ?? null,
    galleryKeys: images.map(image => image.key),
    referenceDataFileKeys: referenceData
      .map(entry => entry.fileKey)
      .filter((key): key is string => !!key),
    characterAvatarUrls: characters
      .map(character => character.avatar)
      .filter((url): url is string => !!url),
    referenceDataDescriptions: referenceData
      .map(entry => entry.description)
      .filter((description): description is string => !!description),
    actionData: actions.map(action => action.actionData),
  };
}

export async function updateCampaignLogo(
  prisma: PrismaClient,
  campaignId: number,
  data: UpdateCampaignLogoInput
): Promise<Campaign> {
  return prisma.campaign.update({
    where: { id: campaignId },
    data: {
      logo: data.logo,
      logoKey: data.logoKey,
    },
  });
}

export async function updateCampaignCover(
  prisma: PrismaClient,
  campaignId: number,
  data: UpdateCampaignCoverInput
): Promise<Campaign> {
  return prisma.campaign.update({
    where: { id: campaignId },
    data: {
      cover: data.cover,
      coverKey: data.coverKey,
    },
  });
}

// Ordine di visualizzazione crescente (append alla coda, vedi
// `addCampaignImage`/`countCampaignImages`).
export async function listCampaignImages(
  prisma: PrismaClient,
  campaignId: number
): Promise<CampaignImage[]> {
  return prisma.campaignImage.findMany({
    where: { campaignId },
    orderBy: { order: "asc" },
  });
}

export async function countCampaignImages(
  prisma: PrismaClient,
  campaignId: number
): Promise<number> {
  return prisma.campaignImage.count({ where: { campaignId } });
}

export async function addCampaignImage(
  prisma: PrismaClient,
  campaignId: number,
  data: CreateCampaignImageInput
): Promise<CampaignImage> {
  return prisma.campaignImage.create({
    data: {
      campaignId,
      url: data.url,
      key: data.key,
      order: data.order,
    },
  });
}

export async function getCampaignImageById(
  prisma: PrismaClient,
  id: number,
  campaignId?: number
): Promise<CampaignImage | null> {
  return prisma.campaignImage.findFirst({
    where: {
      id,
      ...(campaignId ? { campaignId } : {}),
    },
  });
}

export async function removeCampaignImage(
  prisma: PrismaClient,
  id: number
): Promise<CampaignImage> {
  return prisma.campaignImage.delete({
    where: { id },
  });
}
