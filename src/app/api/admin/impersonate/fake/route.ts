import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getUserGroupFlags } from "@/lib/authorization";
import { startImpersonationSchema } from "@/lib/validations/impersonation";

/**
 * Extract a specific cookie value from cookie string
 */
function extractCookie(
  cookieString: string | null,
  name: string
): string | null {
  if (!cookieString) return null;

  const cookies = cookieString.split(";").map(c => c.trim());
  const cookie = cookies.find(c => c.startsWith(`${name}=`));

  return cookie ? cookie.substring(name.length + 1) : null;
}

export async function POST(request: NextRequest) {
  // 1. Authenticate and verify sviluppo access
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

  // 2. Validate request body
  const body = await request.json();
  const validation = startImpersonationSchema.safeParse(body);

  if (!validation.success) {
    return NextResponse.json(
      { error: "Dati non validi", details: validation.error },
      { status: 400 }
    );
  }

  const { targetUserId } = validation.data;

  // 3. Prevent self-impersonation
  if (targetUserId === session.user.id) {
    return NextResponse.json(
      { error: "Non puoi impersonare te stesso" },
      { status: 400 }
    );
  }

  // 4. Verify target user exists
  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, name: true, email: true },
  });

  if (!targetUser) {
    return NextResponse.json({ error: "Utente non trovato" }, { status: 404 });
  }

  // 5. Get admin session token from Better Auth session object
  const cookies = request.headers.get("cookie");
  const adminSessionCookie = extractCookie(
    cookies,
    "better-auth.session_token"
  );
  const adminSessionToken = session.session.token;

  if (!adminSessionToken || !adminSessionCookie) {
    return NextResponse.json(
      { error: "Sessione non trovata" },
      { status: 401 }
    );
  }

  return NextResponse.json({
    token: adminSessionToken,
    cookie: adminSessionCookie,
  });
  /*

  // 6. Start impersonation
  const result = await startImpersonation({
    adminUserId: session.user.id,
    targetUserId,
    adminSessionToken
  });

  // 7. Set cookies and return
  const response = NextResponse.json({
    success: true,
    targetUser: {
      id: targetUser.id,
      name: targetUser.name,
      email: targetUser.email,
    },
  });

  // Set admin session cookie (preserve original)
  response.cookies.set("better-auth.admin_session_token", adminSessionCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });

  // Replace main session cookie with target user's session
  response.cookies.set("better-auth.session_token", result.targetSessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });*/

  //return response;
}
