import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireCampaignMasterBySlug } from "@/lib/authorization";
import {
  deletePrintLayout,
  getPrintLayoutByIdScoped,
  updatePrintLayout,
} from "@/lib/repositories/printLayout.repository";
import { updatePrintLayoutSchema } from "@/lib/validations/printLayout";
import { apiError } from "@/lib/api-helpers";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";

interface RouteContext {
  params: Promise<{ campaignSlug: string; layoutId: string }>;
}

// Risolve campagna (master) e layout scopato: un id di un'altra campagna è
// 404, stesso trattamento di `features/[featureId]`.
async function resolveLayout(
  request: NextRequest,
  campaignSlug: string,
  layoutIdParam: string
) {
  const access = await requireCampaignMasterBySlug(
    prisma,
    request.headers,
    campaignSlug,
    ARCANA_DOMINE_SLUG
  );
  if (access.ok === false) {
    return {
      ok: false as const,
      response: apiError(access.status, access.error),
    };
  }

  const layoutId = Number(layoutIdParam);
  if (!Number.isInteger(layoutId) || layoutId <= 0) {
    return { ok: false as const, response: apiError(400, "Id non valido") };
  }

  const layout = await getPrintLayoutByIdScoped(
    prisma,
    layoutId,
    access.campaign.id
  );
  if (!layout) {
    return {
      ok: false as const,
      response: apiError(404, "Layout non trovato"),
    };
  }

  return { ok: true as const, layout };
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  const { campaignSlug, layoutId } = await params;

  try {
    const resolved = await resolveLayout(request, campaignSlug, layoutId);
    if (!resolved.ok) return resolved.response;

    const body = await request.json().catch(() => null);
    const parsed = updatePrintLayoutSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(400, "Dati non validi", parsed.error.flatten());
    }

    const layout = await updatePrintLayout(prisma, resolved.layout.id, {
      name: parsed.data.name,
      sheet: parsed.data.sheet,
      sheetGap: parsed.data.sheetGap,
      sheetMargin: parsed.data.sheetMargin,
      template: parsed.data.template as Prisma.InputJsonValue | undefined,
    });

    return NextResponse.json(layout);
  } catch (error) {
    console.error("Error updating print layout:", error);
    return apiError(500, "Internal server error");
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { campaignSlug, layoutId } = await params;

  try {
    const resolved = await resolveLayout(request, campaignSlug, layoutId);
    if (!resolved.ok) return resolved.response;

    await deletePrintLayout(prisma, resolved.layout.id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Error deleting print layout:", error);
    return apiError(500, "Internal server error");
  }
}
