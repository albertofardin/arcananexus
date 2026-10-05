import z from "zod";
import {
  themeColors,
  themeTextures,
  type ThemeColor,
  type ThemeTexture,
} from "@/app/themes";

export const dataTypeSchema = z.object({
  name: z.string(),
  icon: z.string().nullable(),
});

// Tinta primaria della campagna (T-045), stesso set di `ThemeColor`
// (`src/app/themes.ts`) e dell'enum Prisma `CampaignColor`.
export const campaignColorEnum = z.enum(
  themeColors.map(c => c.id) as [ThemeColor, ...ThemeColor[]]
);

// Trama decorativa della campagna (HeroBanner/SidePanel), stesso set di
// `ThemeTexture` (`src/app/themes.ts`) e dell'enum Prisma `CampaignTexture`.
export const campaignTextureEnum = z.enum(
  themeTextures.map(t => t.id) as [ThemeTexture, ...ThemeTexture[]]
);

export const campaignSchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
  logo: z.string().nullable(),
  cover: z.string().nullable(),
  color: campaignColorEnum,
  texture: campaignTextureEnum,
  visibility: z.boolean(),
  dataTypes: z.array(dataTypeSchema),
  activeFeatures: z.array(z.string()).default([]),
});

export type Campaign = z.infer<typeof campaignSchema>;

export const EMPTY_INSTANCE: Campaign = {
  id: 0,
  name: "",
  slug: "",
  logo: null,
  cover: null,
  color: "cobalt",
  texture: "none",
  visibility: true,
  dataTypes: [],
  activeFeatures: [],
};

// Tipo campagna (T-1): "campaign" per campagne ricorrenti, "oneShot" per un
// evento singolo.
export const campaignTypeEnum = z.enum(["campaign", "oneShot"]);

// Solo lettere minuscole, numeri e trattini singoli, come per gli altri slug
// della piattaforma (organizzazioni, eventi).
const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const slugField = z
  .string()
  .trim()
  .min(1, "Lo slug è obbligatorio")
  .regex(
    SLUG_REGEX,
    "Lo slug può contenere solo lettere minuscole, numeri e trattini"
  );

export const createCampaignSchema = z.object({
  name: z.string().trim().min(1, "Il nome è obbligatorio"),
  slug: slugField,
  description: z.string().trim().optional(),
  type: campaignTypeEnum.default("campaign"),
  // Slug dell'organizzazione di destinazione; se omesso si usa l'unica
  // organizzazione della piattaforma (ARCANA_DOMINE_SLUG).
  orgSlug: z.string().trim().optional(),
});

export type CreateCampaignBody = z.infer<typeof createCampaignSchema>;

export const updateCampaignSchema = z
  .object({
    name: z.string().trim().min(1, "Il nome è obbligatorio").optional(),
    slug: slugField.optional(),
    description: z.string().trim().optional(),
    type: campaignTypeEnum.optional(),
    color: campaignColorEnum.optional(),
    texture: campaignTextureEnum.optional(),
  })
  .refine(data => Object.keys(data).length > 0, {
    message: "Nessun campo da aggiornare",
  });

export type UpdateCampaignBody = z.infer<typeof updateCampaignSchema>;

// Toggle di visibilità (route dedicata, isSviluppo-only — vedi
// `/api/admin/campaigns/[campaignSlug]/visibility`): separato da
// `updateCampaignSchema` perché non è un campo che l'head_master può toccare
// dalla normale route di aggiornamento campagna.
export const updateCampaignVisibilitySchema = z.object({
  visibility: z.boolean(),
});

export type UpdateCampaignVisibilityBody = z.infer<
  typeof updateCampaignVisibilitySchema
>;
