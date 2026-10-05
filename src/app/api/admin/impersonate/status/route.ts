import { NextRequest, NextResponse } from "next/server";
import { getSessionContext } from "@/lib/impersonation";

export async function GET(request: NextRequest) {
  const context = await getSessionContext(request.headers);

  if (!context) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  return NextResponse.json({
    isImpersonating: context.isImpersonating,
    activeUser: {
      id: context.activeUser.id,
      name: context.activeUser.name,
      email: context.activeUser.email,
    },
    adminUser: context.isImpersonating
      ? {
          id: context.adminUser.id,
          name: context.adminUser.name,
          email: context.adminUser.email,
        }
      : null,
  });
}
