import { EventRegisterPage } from "@/components/EventPages";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ pagamento?: string }>;
}) {
  const { eventId } = await params;
  const { pagamento } = await searchParams;
  return <EventRegisterPage eventId={eventId} payment={pagamento} />;
}
