import type { PrismaClient, Organization } from "@prisma/client";
import type {
  CreateOrganizationInput,
  UpdateOrganizationInput,
  ListOrganizationsOptions,
  PaginatedResult,
} from "./types";

export async function getOrganizationById(
  prisma: PrismaClient,
  id: number,
  includeCampaigns = false
): Promise<Organization | null> {
  return prisma.organization.findUnique({
    where: { id },
    include: includeCampaigns
      ? {
          campaigns: {
            orderBy: { name: "asc" },
          },
        }
      : undefined,
  });
}

export async function getOrganizationBySlug(
  prisma: PrismaClient,
  slug: string,
  includeCampaigns = false
): Promise<Organization | null> {
  return prisma.organization.findUnique({
    where: { slug },
    include: includeCampaigns
      ? {
          campaigns: {
            orderBy: { name: "asc" },
          },
        }
      : undefined,
  });
}

export async function listOrganizations(
  prisma: PrismaClient,
  options: ListOrganizationsOptions = {}
): Promise<PaginatedResult<Organization>> {
  const {
    page = 1,
    pageSize = 20,
    search,
    orderBy = "name",
    orderDirection = "asc",
  } = options;

  const skip = (page - 1) * pageSize;

  const where = search
    ? {
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { description: { contains: search, mode: "insensitive" as const } },
        ],
      }
    : undefined;

  const [data, total] = await Promise.all([
    prisma.organization.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { [orderBy]: orderDirection },
      include: {
        _count: {
          select: { campaigns: true },
        },
      },
    }),
    prisma.organization.count({ where }),
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

export async function listAllOrganizations(
  prisma: PrismaClient
): Promise<Organization[]> {
  return prisma.organization.findMany();
}

export async function getUserOrganizations(
  prisma: PrismaClient,
  userId: string
): Promise<Organization[]> {
  const grants = await prisma.grant.findMany({
    where: { userId },
    include: {
      campaign: {
        include: {
          organization: true,
        },
      },
    },
  });

  const uniqueOrgs = new Map<number, Organization>();

  for (const grant of grants) {
    const org = grant.campaign.organization;
    if (!uniqueOrgs.has(org.id)) {
      uniqueOrgs.set(org.id, org);
    }
  }

  return Array.from(uniqueOrgs.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
}

export async function createOrganization(
  prisma: PrismaClient,
  data: CreateOrganizationInput
): Promise<Organization> {
  return prisma.organization.create({
    data: {
      name: data.name,
      slug: data.slug,
      description: data.description,
    },
  });
}

export async function updateOrganization(
  prisma: PrismaClient,
  id: number,
  data: UpdateOrganizationInput
): Promise<Organization> {
  return prisma.organization.update({
    where: { id },
    data: {
      name: data.name,
      slug: data.slug,
      description: data.description,
    },
  });
}

export async function deleteOrganization(
  prisma: PrismaClient,
  id: number
): Promise<Organization> {
  return prisma.organization.delete({
    where: { id },
  });
}
