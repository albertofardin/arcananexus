import { EventNewPage } from "@/components/EventPages";

export default async function Page({
  params,
}: {
  params: Promise<{ campaignSlug: string }>;
}) {
  const { campaignSlug } = await params;
  return <EventNewPage campaignSlug={campaignSlug} />;
}
