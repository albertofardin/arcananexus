import { Metadata } from "next";
import {
  EventDetailPage,
  generateEventMetadata,
} from "@/components/EventPages";

type PageProps = {
  params: Promise<{ campaignSlug: string; eventId: string }>;
  searchParams: Promise<{ iscrizione?: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { eventId } = await params;
  return generateEventMetadata(eventId);
}

export default async function Page({ params, searchParams }: PageProps) {
  const { campaignSlug, eventId } = await params;
  const { iscrizione } = await searchParams;
  return (
    <EventDetailPage
      campaignSlug={campaignSlug}
      eventId={eventId}
      notice={iscrizione}
    />
  );
}
