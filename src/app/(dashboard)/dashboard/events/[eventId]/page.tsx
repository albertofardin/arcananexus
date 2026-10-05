import { Metadata } from "next";
import {
  EventDetailPage,
  generateEventMetadata,
} from "@/components/EventPages";

type PageProps = {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ iscrizione?: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { eventId } = await params;
  return generateEventMetadata(eventId);
}

export default async function Page({ params, searchParams }: PageProps) {
  const { eventId } = await params;
  const { iscrizione } = await searchParams;
  return <EventDetailPage eventId={eventId} notice={iscrizione} />;
}
