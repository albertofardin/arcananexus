import { EventEditPage } from "@/components/EventPages";

export default async function Page({
  params,
}: {
  params: Promise<{ campaignSlug: string; eventId: string }>;
}) {
  const { campaignSlug, eventId } = await params;
  return <EventEditPage campaignSlug={campaignSlug} eventId={eventId} />;
}
