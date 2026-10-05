import { NextRequest, NextResponse } from "next/server";
import { APIError } from "better-auth/api";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getUserGroupFlags } from "@/lib/authorization";
import { startImpersonationSchema } from "@/lib/validations/impersonation";

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session?.user || !session?.session) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const flags = await getUserGroupFlags(prisma, session.user.id);
  if (!flags?.isSviluppo) {
    return NextResponse.json(
      { error: "Permessi insufficienti" },
      { status: 403 }
    );
  }

  // Il plugin `admin` di Better Auth applica un proprio gate su
  // `session.user.role` (`adminRoles: ["admin"]`, il default), indipendente
  // dal controllo `isSviluppo` sopra. Sincronizzarlo qui — invece di una
  // lista di user id hardcoded per ambiente (bug: gli id di dev e prod sono
  // diversi) — lo deriva sempre dalla stessa fonte di verità applicativa
  // (email/flag `isSviluppo`), quindi funziona identico in ogni ambiente.
  if (session.user.role !== "admin") {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { role: "admin" },
    });
  }

  const body = await request.json();
  const validation = startImpersonationSchema.safeParse(body);

  if (!validation.success) {
    return NextResponse.json(
      { error: "Dati non validi", details: validation.error },
      { status: 400 }
    );
  }

  const { targetUserId } = validation.data;

  if (targetUserId === session.user.id) {
    return NextResponse.json(
      { error: "Non puoi impersonare te stesso" },
      { status: 400 }
    );
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, name: true, email: true },
  });

  if (!targetUser) {
    return NextResponse.json({ error: "Utente non trovato" }, { status: 404 });
  }

  try {
    // Delega la creazione/firma della sessione impersonata al plugin
    // `admin` di Better Auth (T-010, bug P0): scrive lui i cookie corretti
    // (sessione target + `admin_session` con quella originale), invece della
    // ricostruzione manuale non firmata di prima. `returnHeaders: true`
    // restituisce i `Set-Cookie` generati, che replichiamo sulla nostra
    // `NextResponse` — chiamare `auth.api.*` direttamente (bypassando
    // `auth.handler`) qui è voluto: l'autorizzazione è già verificata sopra
    // (`isSviluppo` effettivo, via `getUserGroupFlags`) e il plugin stesso
    // applica `adminUserIds` come secondo cancello.
    const { headers: authHeaders } = await auth.api.impersonateUser({
      headers: request.headers,
      body: { userId: targetUserId },
      returnHeaders: true,
    });

    const response = NextResponse.json({
      success: true,
      targetUser: {
        id: targetUser.id,
        name: targetUser.name,
        email: targetUser.email,
      },
    });

    for (const cookie of authHeaders.getSetCookie()) {
      response.headers.append("set-cookie", cookie);
    }

    return response;
  } catch (error) {
    if (error instanceof APIError) {
      return NextResponse.json(
        { error: "Impossibile avviare l'impersonazione" },
        { status: error.statusCode ?? 400 }
      );
    }
    console.error("Error starting impersonation:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
