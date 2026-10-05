import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { getEffectiveUserId, hasAdminSectionAccess } from "@/lib/authorization";
import EmptyCard from "@/components/Feedback/EmptyCard";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headersList = await headers();
  const userId = await getEffectiveUserId(headersList);
  if (!userId) {
    notFound();
  }

  const authorized = await hasAdminSectionAccess(prisma, userId);
  if (!authorized) {
    return (
      <EmptyCard
        icon="lock"
        title="Permessi insufficienti"
        message="Questa sezione è riservata al direttivo e a Sviluppo Web."
      />
    );
  }

  return children;
}
