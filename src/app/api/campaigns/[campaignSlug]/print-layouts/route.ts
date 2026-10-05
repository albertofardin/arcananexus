import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireCampaignMasterBySlug } from "@/lib/authorization";
import { createPrintLayout } from "@/lib/repositories/printLayout.repository";
import { createPrintLayoutSchema } from "@/lib/validations/printLayout";
import { apiError } from "@/lib/api-helpers";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";

interface RouteContext {
  params: Promise<{ campaignSlug: string }>;
}

// Salva un nuovo layout dell'Area Stampa. Riservata al master di campagna
// (head_master incluso) o super-admin. L'elenco non ha un GET: la pagina lo
// carica lato server e si riallinea con `router.refresh()`.
export async function POST(request: NextRequest, { params }: RouteContext) {
  const { campaignSlug } = await params;

  try {
    const access = await requireCampaignMasterBySlug(
      prisma,
      request.headers,
      campaignSlug,
      ARCANA_DOMINE_SLUG
    );
    if (access.ok === false) {
      return apiError(access.status, access.error);
    }

    const body = await request.json().catch(() => null);
    const parsed = createPrintLayoutSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(400, "Dati non validi", parsed.error.flatten());
    }

    const layout = await createPrintLayout(prisma, {
      campaignId: access.campaign.id,
      source: parsed.data.source,
      name: parsed.data.name,
      template: parsed.data.template as Prisma.InputJsonValue,
      sheet: parsed.data.sheet,
      sheetGap: parsed.data.sheetGap,
      sheetMargin: parsed.data.sheetMargin,
    });

    return NextResponse.json(layout, { status: 201 });
  } catch (error) {
    console.error("Error creating print layout:", error);
    return apiError(500, "Internal server error");
  }
}
