import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { listAllOrganizations } from "@/lib/repositories/organization.repository";
import { apiError } from "@/lib/api-helpers";

export async function GET() {
  try {
    const orgs = await listAllOrganizations(prisma);
    return NextResponse.json(orgs);
  } catch (error) {
    console.error("Error fetching organizations:", error);
    return apiError(500, "Internal server error");
  }
}
