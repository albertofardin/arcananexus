"use client";

import { useParams } from "next/navigation";
import EventList from "@/components/EventList";

export default function Page() {
  const { campaignSlug } = useParams<{ campaignSlug: string }>();
  return <EventList campaignSlug={campaignSlug} />;
}
