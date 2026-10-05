import { EventRegisterPage } from "@/components/EventPages";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ campaignSlug: string; eventId: string }>;
  searchParams: Promise<{ pagamento?: string }>;
}) {
  const { campaignSlug, eventId } = await params;
  const { pagamento } = await searchParams;
  return (
    <EventRegisterPage
      campaignSlug={campaignSlug}
      eventId={eventId}
      payment={pagamento}
    />
  );
}
