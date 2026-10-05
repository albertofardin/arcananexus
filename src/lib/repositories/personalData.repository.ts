import type { PrismaClient, PersonalData } from "@prisma/client";
import type { UpsertPersonalDataInput } from "./types";

export async function getPersonalDataByUserId(
  prisma: PrismaClient,
  userId: string
): Promise<PersonalData | null> {
  return prisma.personalData.findUnique({
    where: { userId },
  });
}

export async function upsertPersonalData(
  prisma: PrismaClient,
  userId: string,
  data: UpsertPersonalDataInput
): Promise<PersonalData> {
  return prisma.personalData.upsert({
    where: { userId },
    create: {
      userId,
      ...data,
    },
    update: {
      ...data,
    },
  });
}
