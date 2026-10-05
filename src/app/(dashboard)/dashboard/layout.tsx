import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getEffectiveUserId } from "@/lib/authorization";

export default async function DashboardAuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headersList = await headers();
  const userId = await getEffectiveUserId(headersList);

  if (!userId) {
    const pathname = headersList.get("x-pathname");
    const redirectTo = pathname
      ? `&redirectTo=${encodeURIComponent(pathname)}`
      : "";
    redirect(`/?login=1${redirectTo}`);
  }

  return children;
}
