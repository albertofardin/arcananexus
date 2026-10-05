import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import {
  getCurrentAssociationYear,
  getUserGroupFlags,
  hasValidMembershipForYear,
} from "@/lib/authorization";
import { createVoucherGrant } from "@/lib/repositories/voucher.repository";
import { listMembersForYear } from "@/lib/repositories/membership.repository";
import { createVoucherSchema } from "@/lib/validations/voucher";
import { apiError } from "@/lib/api-helpers";

// Tesserati dell'anno corrente tra cui scegliere il destinatario del buono
// (modale "Crea Buono"). Stessi permessi del POST: direttivo tesserato.
export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return apiError(401, "Non autenticato");

  try {
    const flags = await getUserGroupFlags(prisma, session.user.id);
    if (!flags?.isDirettivo) return apiError(403, "Permessi insufficienti");

    const year = getCurrentAssociationYear();
    if (!(await hasValidMembershipForYear(prisma, session.user.id, year))) {
      return apiError(403, `Devi essere tesserato per il ${year}`);
    }

    const members = await listMembersForYear(prisma, year);
    return NextResponse.json({
      year,
      members: members.map(member => ({
        id: member.id,
        label: member.PersonalData
          ? `${member.PersonalData.firstName} ${member.PersonalData.lastName} (${member.name})`
          : member.name,
        image: member.image,
      })),
    });
  } catch (error) {
    console.error("Error listing voucher members:", error);
    return apiError(500, "Internal server error");
  }
}

// Crea un buono (accredito sul saldo buoni dell'anno corrente) per un
// tesserato dell'anno. Riservato al direttivo tesserato; l'utente riceve la notifica
// (pannello + push + email).
export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return apiError(401, "Non autenticato");

  const parsed = createVoucherSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) return apiError(400, "Dati non validi");

  try {
    const flags = await getUserGroupFlags(prisma, session.user.id);
    if (!flags?.isDirettivo) return apiError(403, "Permessi insufficienti");

    const year = getCurrentAssociationYear();
    if (!(await hasValidMembershipForYear(prisma, session.user.id, year))) {
      return apiError(403, `Devi essere tesserato per il ${year}`);
    }
    if (!(await hasValidMembershipForYear(prisma, parsed.data.userId, year))) {
      return apiError(422, `L'utente non è tesserato per il ${year}`);
    }

    const voucher = await createVoucherGrant(prisma, {
      userId: parsed.data.userId,
      year,
      amount: parsed.data.amount,
      createdById: session.user.id,
    });
    return NextResponse.json({ id: voucher.id }, { status: 201 });
  } catch (error) {
    console.error("Error creating voucher:", error);
    return apiError(500, "Internal server error");
  }
}
