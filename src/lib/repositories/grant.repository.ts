import { Role, type PrismaClient, type Grant } from "@prisma/client";
import type {
  CreateGrantInput,
  GrantWithUser,
  PrismaTransactionClient,
} from "./types";

const userSelect = {
  id: true,
  name: true,
  email: true,
  image: true,
} as const;

export async function createGrant(
  prisma: PrismaClient,
  data: CreateGrantInput
): Promise<GrantWithUser> {
  return prisma.grant.create({
    data: {
      userId: data.userId,
      campaignId: data.campaignId,
      role: data.role,
    },
    include: {
      user: { select: userSelect },
    },
  });
}

export async function updateGrantRole(
  prisma: PrismaClient,
  userId: string,
  campaignId: number,
  role: Role
): Promise<GrantWithUser> {
  return prisma.grant.update({
    where: { userId_campaignId: { userId, campaignId } },
    data: { role },
    include: {
      user: { select: userSelect },
    },
  });
}

export async function revokeGrant(
  prisma: PrismaClient,
  userId: string,
  campaignId: number
): Promise<Grant> {
  return prisma.grant.delete({
    where: { userId_campaignId: { userId, campaignId } },
  });
}

export async function getGrant(
  prisma: PrismaClient,
  userId: string,
  campaignId: number
): Promise<Grant | null> {
  return prisma.grant.findUnique({
    where: { userId_campaignId: { userId, campaignId } },
  });
}

// Conta gli head_master di una campagna: usata per garantire che ce ne sia
// sempre almeno uno prima di consentirne la retrocessione o la rimozione
// (invariante di T-1, gestione ruoli campagna).
export async function countHeadMastersForCampaign(
  prisma: PrismaClient,
  campaignId: number
): Promise<number> {
  return prisma.grant.count({
    where: { campaignId, role: Role.head_master },
  });
}

// Accetta `PrismaTransactionClient` (T-0xx, fan-out notifiche "nuovo PG in
// review" dentro la transazione di creazione del personaggio): stesso
// contratto di composabilità di `action.repository.ts`/
// `xpTransaction.repository.ts`, non solo `PrismaClient` da solo.
export async function listGrantsForCampaign(
  prisma: PrismaTransactionClient,
  campaignId: number
): Promise<GrantWithUser[]> {
  return prisma.grant.findMany({
    where: { campaignId },
    include: {
      user: { select: userSelect },
    },
    orderBy: { user: { name: "asc" } },
  });
}

// Slug delle campagne dove l'utente è master o head_master: usata dal gating
// client della navigazione di campagna (Gestione Staff, T-012) e da
// /api/me/capabilities, dove alimenta `masterCampaigns`.
export async function getMasterCampaignSlugs(
  prisma: PrismaClient,
  userId: string
): Promise<string[]> {
  const grants = await prisma.grant.findMany({
    where: { userId, role: { in: [Role.head_master, Role.master] } },
    select: { campaign: { select: { slug: true } } },
  });

  return grants.map(g => g.campaign.slug);
}

// Id delle campagne dove l'utente è master o head_master (visibilità bozze eventi).
export async function getMasterCampaignIds(
  prisma: PrismaClient,
  userId: string
): Promise<number[]> {
  const grants = await prisma.grant.findMany({
    where: { userId, role: { in: [Role.head_master, Role.master] } },
    select: { campaignId: true },
  });

  return grants.map(g => g.campaignId);
}

// Campagne (id/slug/nome) che l'utente può gestire come master/head_master:
// opzioni del selettore campagna nel form evento.
export async function listMasterCampaigns(
  prisma: PrismaClient,
  userId: string,
  orgSlug: string
) {
  const grants = await prisma.grant.findMany({
    where: {
      userId,
      role: { in: [Role.head_master, Role.master] },
      campaign: { organization: { slug: orgSlug } },
    },
    select: { campaign: { select: { slug: true, name: true } } },
  });

  return grants.map(g => g.campaign);
}
