import { NextResponse } from "next/server";

export function apiError(status: number, message: string, details?: unknown) {
  return NextResponse.json(
    details === undefined ? { error: message } : { error: message, details },
    { status }
  );
}

export function methodNotAllowed(allowed: readonly string[]) {
  return new NextResponse(null, {
    status: 405,
    headers: { Allow: allowed.join(", ") },
  });
}

export function preflight(allowed: readonly string[]) {
  return new NextResponse(null, {
    status: 204,
    headers: { Allow: allowed.join(", ") },
  });
}
