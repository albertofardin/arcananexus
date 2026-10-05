"use client";

import Card from "@/components/_core/Card";
import Btn from "@/components/_core/Btn";
import BtnLink from "@/components/_core/BtnLink";
import Skeleton from "@/components/_core/Skeleton";
import { ErrorCard } from "@/components/Feedback";
import HeroSection from "@/components/HeroSection";
import { useQueryCampaignCurrentEvent } from "@/lib/queries/campaignCurrentEvent";
import { routes } from "@/app/routes";

// Evento "corrente" della campagna (T-0xx): un link diretto se esiste già,
// altrimenti il pulsante di creazione evento (le registrazioni qui sotto
// restano un placeholder "in arrivo").
const EventCard = ({ campaignSlug }: { campaignSlug: string }) => {
  const {
    data: event,
    isLoading,
    error,
    refetch,
  } = useQueryCampaignCurrentEvent(campaignSlug);

  return (
    <Card className="flex-col items-stretch gap-3 p-2">
      <HeroSection
        icon="event"
        title="Evento"
        subtitle="L'evento su cui la campagna sta lavorando"
      />
      <div className="flex flex-wrap items-center gap-3">
        <Btn
          variant="bold"
          icon="person_add"
          label="Apri registrazioni"
          disabled
          tooltip="Funzionalità in arrivo"
        />
        <Btn
          icon="person_off"
          label="Chiudi registrazioni"
          disabled
          tooltip="Funzionalità in arrivo"
        />
        <div className="flex-1" />
        {isLoading ? (
          <Skeleton className="h-[35px] w-[220px]" />
        ) : error ? (
          <ErrorCard onRetry={() => refetch()} />
        ) : event ? (
          <BtnLink
            variant="bold"
            icon="event"
            label={`Vai a "${event.name}"`}
            href={routes.campaignEvent(campaignSlug, event.id)}
          />
        ) : (
          <BtnLink
            variant="bold"
            icon="add"
            label="Crea nuovo evento"
            href={routes.eventNew(campaignSlug)}
          />
        )}
      </div>
    </Card>
  );
};

export default EventCard;
