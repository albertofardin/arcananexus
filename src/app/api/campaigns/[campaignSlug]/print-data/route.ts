import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireCampaignMasterBySlug } from "@/lib/authorization";
import { printDataSchema } from "@/lib/validations/printLayout";
import { buildCharacterRows, buildReferenceRows } from "@/lib/print/rows";
import { apiError } from "@/lib/api-helpers";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";

interface RouteContext {
  params: Promise<{ campaignSlug: string }>;
}

// Dati da stampare per i personaggi/voci scelti nell'Area Stampa, già nella
// forma "chiave campo → valore" consumata dal generatore pdfme. Solo
// master: la stampa include voci e note non visibili ai giocatori.
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
    const parsed = printDataSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(400, "Dati non validi", parsed.error.flatten());
    }

    const { source, ids } = parsed.data;
    const rows =
      source === "character"
        ? await buildCharacterRows(prisma, access.campaign.id, ids)
        : await buildReferenceRows(prisma, access.campaign.id, ids);

    return NextResponse.json({ rows });
  } catch (error) {
    console.error("Error building print data:", error);
    return apiError(500, "Internal server error");
  }
}
