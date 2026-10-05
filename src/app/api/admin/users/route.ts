import { NextResponse } from "next/server";
import { requireAdminSectionAccess } from "@/lib/authorization";
import { prisma } from "@/lib/db";
import { listUsersForAdmin } from "@/lib/repositories/user.repository";
import {
  adminUsersQuerySchema,
  adminUsersResponseSchema,
} from "@/lib/validations/user";
import { apiError } from "@/lib/api-helpers";

// Elenco utenti per la schermata di amministrazione: ricerca su nome/email,
// filtro per anno di tesseramento e paginazione. Riservato a direttivo/sviluppo
// web (sezione Amministrazione).
export const GET = requireAdminSectionAccess(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const parsedQuery = adminUsersQuerySchema.safeParse(
    Object.fromEntries(searchParams)
  );
  if (!parsedQuery.success) {
    return apiError(400, "Parametri non validi", parsedQuery.error.flatten());
  }
  const { search, year, page, pageSize } = parsedQuery.data;

  try {
    const { users, total, availableYears } = await listUsersForAdmin(prisma, {
      search,
      year,
      page,
      pageSize,
    });

    const response = adminUsersResponseSchema.parse({
      users,
      availableYears,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error fetching admin users:", error);
    return apiError(500, "Internal server error");
  }
});
