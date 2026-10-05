import { prisma } from "@/lib/db";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;
  const orgs = await prisma.campaign.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      dataTypes: true,
    },
    where: {
      organizationId: Number.parseInt(orgId),
    },
  });
  return new Response(JSON.stringify(orgs), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

export async function POST(_request: Request) {}
export async function PUT(_request: Request) {}
export async function PATCH(_request: Request) {}
export async function DELETE(_request: Request) {}
export async function OPTION(_request: Request) {}
export async function HEAD(_request: Request) {}
