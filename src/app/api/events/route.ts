import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  eventSchema,
  eventListResponseSchema,
  eventStatusFilterEnum,
  eventSortDirectionEnum,
  eventWriteSchema,
} from "@/lib/validations/event";
import { auth } from "@/lib/auth";
import {
  createEvent,
  listPublishedEvents,
} from "@/lib/repositories/event.repository";
import { getOrganizationBySlug } from "@/lib/repositories/organization.repository";
import { getCampaignBySlug } from "@/lib/repositories/campaign.repository";
import { getMasterCampaignIds } from "@/lib/repositories/grant.repository";
import { canManageEvents, hasAdminSectionAccess } from "@/lib/authorization";
import { apiError } from "@/lib/api-helpers";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 12;

// T-3: catalogo pubblico degli eventi pubblicati (pagina eventi/booking) —
// resta senza autenticazione richiesta. Il filtro `myBookings` richiede una
// sessione solo per filtrare sull'utente corrente (dato self-scoped), non un
// ruolo di campagna: gli eventi non sono un'area di amministrazione.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const orgSlug = searchParams.get("orgSlug") ?? undefined;
  const campaignSlug = searchParams.get("campaignSlug") ?? undefined;
  const noCampaign = searchParams.get("noCampaign") === "true";
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const status = eventStatusFilterEnum.safeParse(
    searchParams.get("status")
  ).data;
  const sort = eventSortDirectionEnum.safeParse(searchParams.get("sort")).data;
  const myBookings = searchParams.get("myBookings") === "true";
  const page = parseInt(searchParams.get("page") ?? String(DEFAULT_PAGE));
  const pageSize = parseInt(
    searchParams.get("pageSize") ?? String(DEFAULT_PAGE_SIZE)
  );

  try {
    const session = await auth.api.getSession({ headers: request.headers });
    const userId = session?.user?.id;
    // Chi gestisce eventi vede anche le bozze (iscrizioni non ancora aperte).
    const includeAllUnpublished = userId
      ? await hasAdminSectionAccess(prisma, userId)
      : false;
    const unpublishedCampaignIds =
      userId && !includeAllUnpublished
        ? await getMasterCampaignIds(prisma, userId)
        : undefined;

    const { events, totalCount } = await listPublishedEvents(prisma, {
      orgSlug,
      campaignSlug,
      noCampaign,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      status,
      myBookingsUserId: myBookings ? userId : undefined,
      includeAllUnpublished,
      unpublishedCampaignIds,
      page,
      pageSize,
      sortDirection: sort,
    });

    const validatedEvents = events.map(event =>
      eventSchema.parse({
        id: event.id,
        name: event.name,
        place: event.place ?? "",
        image: event.image,
        dateEventStart: event.dateEventStart,
        datePublicationStart: event.datePublicationStart,
        datePublicationEnd: event.datePublicationEnd,
        dateEventEnd: event.dateEventEnd,
        price: Number(event.price),
        visibility: event.visibility,
        campaignName: event.campaign?.name ?? null,
        campaignSlug: event.campaign?.slug ?? null,
        campaignColor: event.campaign?.color ?? null,
        campaignLogo: event.campaign?.logo ?? null,
        bookingCount: event._count.bookings,
      })
    );

    const response = eventListResponseSchema.parse({
      events: validatedEvents,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
      },
    });

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error fetching events:", error);
    return apiError(500, "Internal server error");
  }
}

// Creazione evento: master della campagna scelta, oppure direttivo/sviluppo
// (unici a poter creare eventi senza campagna).
export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return apiError(401, "Non autenticato");
  }

  const parsed = eventWriteSchema.safeParse(await request.json());
  if (!parsed.success) {
    return apiError(400, "Dati non validi", parsed.error.flatten());
  }
  const { campaignSlug, ...input } = parsed.data;

  try {
    const organization = await getOrganizationBySlug(
      prisma,
      ARCANA_DOMINE_SLUG
    );
    if (!organization) {
      return apiError(404, "Organizzazione non trovata");
    }

    const campaign = campaignSlug
      ? await getCampaignBySlug(prisma, campaignSlug, ARCANA_DOMINE_SLUG)
      : null;
    if (campaignSlug && !campaign) {
      return apiError(404, "Campagna non trovata");
    }

    if (
      !(await canManageEvents(prisma, session.user.id, campaign?.id ?? null))
    ) {
      return apiError(403, "Permessi insufficienti");
    }

    const event = await createEvent(prisma, {
      ...input,
      organizationId: organization.id,
      campaignId: campaign?.id ?? null,
    });

    return NextResponse.json(
      { id: event.id, campaignSlug: campaign?.slug ?? null },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating event:", error);
    return apiError(500, "Internal server error");
  }
}
