import type {
  Prisma,
  PrismaClient,
  CampaignType,
  CampaignColor,
  CampaignTexture,
  Role,
  DataTypeKind,
  DataCardinality,
  DataTypeAssignability,
  DataTypeRender,
  DataVisibility,
  RequirementType,
} from "@prisma/client";

// Client Prisma "normale" o client di transazione (`prisma.$transaction`):
// ogni funzione di scrittura dei repository che deve poter essere composta
// dentro la transazione di un chiamante (T-017, T-036, ...) accetta questo
// tipo invece di `PrismaClient` da solo. Nome generico e posizione condivisa
// (non un repository di dominio specifico) perché è usato trasversalmente
// da repository che non hanno nulla a che fare con l'XP (`characterData`,
// `dataType`, `referenceData`, `action`, `character`, `dataRequirement`).
export type PrismaTransactionClient = PrismaClient | Prisma.TransactionClient;

// Pagination types
export interface PaginationOptions {
  page?: number;
  pageSize?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

// Organization types
export interface CreateOrganizationInput {
  name: string;
  slug: string;
  description?: string;
}

export interface UpdateOrganizationInput {
  name?: string;
  slug?: string;
  description?: string;
}

export interface ListOrganizationsOptions extends PaginationOptions {
  search?: string;
  orderBy?: "name" | "createdAt" | "updatedAt";
  orderDirection?: "asc" | "desc";
}

// Campaign types
export interface CreateCampaignInput {
  name: string;
  slug: string;
  description?: string;
  type?: CampaignType;
  organizationId: number;
}

export interface UpdateCampaignInput {
  name?: string;
  slug?: string;
  description?: string;
  type?: CampaignType;
  color?: CampaignColor;
  texture?: CampaignTexture;
}

// Presentazione campagna (T-045): logo/copertina hanno una colonna `*Key`
// dedicata (pattern `ReferenceData.fileKey`), aggiornate insieme perché non
// ha senso persistere l'una senza l'altra (`null`/`null` = rimossa).
export interface UpdateCampaignLogoInput {
  logo: string | null;
  logoKey: string | null;
}

export interface UpdateCampaignCoverInput {
  cover: string | null;
  coverKey: string | null;
}

export interface CreateCampaignImageInput {
  campaignId: number;
  url: string;
  key: string;
  order: number;
}

// Riferimenti grezzi a tutti i file UploadThing legati a una campagna
// (logo/copertina, galleria, documenti reference-data, avatar personaggi,
// immagini incorporate nei campi rich-text), da leggere prima di
// `deleteCampaign` — il cascade Prisma cancella le righe, non i file su
// storage. `characterAvatarUrls`/`referenceDataDescriptions`/`actionData`
// sono dati grezzi (URL/HTML/Json), non key già estratte: `Character` non
// ha una colonna key dedicata per l'avatar (stesso motivo di
// `extractUploadThingKey` in `avatarUpload.ts`) e i campi rich-text
// incorporano zero o più immagini dentro l'HTML/Json, non una key sola —
// l'estrazione è responsabilità del chiamante (vedi
// `extractUploadThingKeysFromRichText`/`extractUploadThingKeysFromActionData`
// in `@/lib/richTextImageUpload`).
export interface CampaignUploadThingRefs {
  logoKey: string | null;
  coverKey: string | null;
  galleryKeys: string[];
  referenceDataFileKeys: string[];
  characterAvatarUrls: string[];
  referenceDataDescriptions: string[];
  actionData: Prisma.JsonValue[];
}

export interface ListCampaignsOptions extends PaginationOptions {
  organizationId?: number;
  search?: string;
  orderBy?: "name" | "createdAt" | "updatedAt";
  orderDirection?: "asc" | "desc";
}

// DataType types
// `cardinality` è nullable (T-035): significativo solo quando
// `assignability !== "none"` (invariante applicata a monte, Zod).
export interface CreateDataTypeInput {
  name: string;
  campaignId: number;
  kind?: DataTypeKind;
  description?: string | null;
  cardinality?: DataCardinality | null;
  assignability?: DataTypeAssignability;
  mandatory?: boolean;
  sidebarShow?: boolean;
  sidebarOrder?: number | null;
  icon?: string | null;
  renderAs?: DataTypeRender;
  visibility?: DataVisibility;
}

// `kind` è aggiornabile (guard "talent non cambia mai kind" + "solo su una
// riga senza `ReferenceData` figlie" applicati dalla route, non qui — vedi
// commento in `validations/dataType.ts`).
export interface UpdateDataTypeInput {
  name?: string;
  description?: string | null;
  kind?: DataTypeKind;
  cardinality?: DataCardinality | null;
  assignability?: DataTypeAssignability;
  mandatory?: boolean;
  sidebarShow?: boolean;
  sidebarOrder?: number | null;
  icon?: string | null;
  renderAs?: DataTypeRender;
  visibility?: DataVisibility;
}

// ReferenceData types (catalogo, T-016). `flags` porta gli attributi
// dichiarativi per-`kind`, validati a monte (route) con lo schema Zod del
// `kind` del `DataType` — il repository si limita a persistere il JSON già
// validato.
export interface CreateReferenceDataInput {
  dataTypeId: number;
  name: string;
  description?: string | null;
  flags?: Prisma.InputJsonValue | null;
  visibility?: DataVisibility;
  fileUrl?: string | null;
  // Chiave del file su UploadThing (T-021), distinta dall'URL: serve alla
  // delete lato storage (`utapi.deleteFiles`) quando il documento viene
  // sostituito o rimosso.
  fileKey?: string | null;
  externalId?: string | null;
}

export interface UpdateReferenceDataInput {
  name?: string;
  description?: string | null;
  flags?: Prisma.InputJsonValue | null;
  visibility?: DataVisibility;
  fileUrl?: string | null;
  fileKey?: string | null;
  externalId?: string | null;
}

// DataRequirement types (grafo prerequisiti/esclusioni tra voci di catalogo).
export interface CreateDataRequirementInput {
  definitionId: number;
  requiredDefinitionId: number;
  type: RequirementType;
  // OR-group (`type: "requires"` o `"visibleWith"`, stessa semantica AND/OR
  // per entrambi — vedi commento su schema.prisma): `null`/assente = riga
  // individuale obbligatoria (AND, invariato).
  groupId?: number | null;
}

// PersonalData types
// Nessun campo `email`: `User.email` (Better Auth) resta l'unica fonte di
// verità (vedi review T-6, MAJOR #3).
export interface UpsertPersonalDataInput {
  firstName: string;
  lastName: string;
  ssn: string;
  address: string;
  dateOfBirth: Date;
  placeOfBirth: string;
  phone?: string;
  nationality?: string;
  guardianName?: string;
  guardianPhone?: string;
  guardianEmail?: string;
}

// Grant types
export interface CreateGrantInput {
  userId: string;
  campaignId: number;
  role: Role;
}

// CharacterTalentUnlock types
export interface CreateCharacterTalentUnlockInput {
  characterId: number;
  referenceDataId: number;
  unlockedById: string;
}

export type GrantWithUser = Prisma.GrantGetPayload<{
  include: {
    user: {
      select: { id: true; name: true; email: true; image: true };
    };
  };
}>;

export type CampaignWithGrants = Prisma.CampaignGetPayload<{
  select: {
    id: true;
    name: true;
    slug: true;
    grants: {
      select: { userId: true; role: true };
    };
  };
}>;

// Helper type for includes
export type CampaignWithRelations = Prisma.CampaignGetPayload<{
  include: {
    organization: true;
    dataTypes: true;
    events: true;
    characters: true;
    grants: true;
  };
}>;
