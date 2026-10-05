"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import EventCard from "./EventCard";
import PausableFeatureCard from "./PausableFeatureCard";
import ExperienceCard from "./ExperienceCard";
import type { ResetTarget } from "./ResetPointsButtons";
import Btn from "@/components/_core/Btn";
import Card from "@/components/_core/Card";
import HeroPage from "@/components/HeroPage";
import { useQueryCampaignFeatures } from "@/lib/queries/campaignFeatures";
import { FT_MISSIVE, FT_DOWNTIME } from "@/lib/features/featuresName";

// Pannello sommario per il master (T-0xx): scorciatoie sull'andamento della
// campagna. Missive e Downtime condividono la stessa struttura (header di
// dominio + pannello di stato colorato) sopra PausableFeatureCard e
// differiscono solo per copy/icona/target di reset, quindi restano qui come
// config invece che come componenti dedicati.
const PAUSABLE_FEATURES: Array<{
  functionName: string;
  icon: string;
  title: string;
  subtitle: string;
  explanation: string;
  activeStatusText: string;
  pausedStatusText: string;
  resetTarget: ResetTarget;
  pausedMessage: string;
  resumedMessage: string;
}> = [
  {
    functionName: FT_MISSIVE,
    icon: "mail",
    title: "Missive",
    subtitle: "Punti missiva dei personaggi e invio di missive e risposte",
    explanation:
      "I giocatori usano i punti missiva per inviare missive e rispondere a quelle ricevute. Il reset reimposta i punti missiva configurati di campagna a tutti i personaggi attivi, azione da fare esplicitamente dopo la conclusione di un evento.",
    activeStatusText:
      "I giocatori possono inviare missive e rispondere normalmente.",
    pausedStatusText:
      "I giocatori non possono inviare nuove missive né rispondere. I master possono continuare a farlo.",
    resetTarget: "missive",
    pausedMessage:
      "Invio missive sospeso: i PG non possono più inviare missive o risposte",
    resumedMessage: "Invio missive riattivato",
  },
  {
    functionName: FT_DOWNTIME,
    icon: "downtime",
    title: "Downtime",
    subtitle: "Punti downtime dei personaggi e invio di downtime e risposte",
    explanation:
      "I giocatori usano i punti downtime per dichiarare azioni tra un evento e l'altro (es. lavorare, indagare) e rispondere a quelle ricevute. Il reset reimposta i punti downtime configurati di campagna a tutti i personaggi attivi, azione da fare esplicitamente dopo la conclusione di un evento.",
    activeStatusText:
      "I giocatori possono dichiarare downtime e rispondere normalmente.",
    pausedStatusText:
      "I giocatori non possono dichiarare nuovi downtime né rispondere. I master possono continuare a farlo.",
    resetTarget: "downtime",
    pausedMessage:
      "Invio downtime sospeso: i PG non possono più inviare downtime o risposte",
    resumedMessage: "Invio downtime riattivato",
  },
];

const CampaignProgress = () => {
  const params = useParams<{ campaignSlug: string }>();
  const campaignSlug = params.campaignSlug;

  const {
    data: campaignFeatures,
    isLoading: featuresLoading,
    refetch: refetchFeatures,
  } = useQueryCampaignFeatures(campaignSlug);

  const [tab, setTab] = React.useState("event");

  const isActive = (functionName: string) =>
    featuresLoading ||
    campaignFeatures?.some(
      f => f.featureType.functionName === functionName && f.active
    );
  const features = PAUSABLE_FEATURES.filter(f => isActive(f.functionName));
  const tabs = [
    { id: "event", label: "Evento", icon: "event" },
    ...features.map(f => ({
      id: f.functionName,
      label: f.title,
      icon: f.icon,
    })),
    { id: "xp", label: "Esperienza", icon: "stars" },
  ];
  // Se la feature attiva sparisce (es. disattivata) si torna a "Evento".
  const current = tabs.some(t => t.id === tab) ? tab : "event";

  return (
    <>
      <HeroPage
        title="Progressione della campagna"
        subtitle="Scorciatoie per gestire evento, missive, downtime ed esperienza"
      />

      <Card className="flex flex-col items-stretch p-2">
        <div className="flex flex-wrap gap-2">
          {tabs.map(t => (
            <Btn
              key={t.id}
              variant="light"
              label={t.label}
              icon={t.icon}
              selected={current === t.id}
              onClick={() => setTab(t.id)}
            />
          ))}
        </div>
      </Card>

      {current === "event" && <EventCard campaignSlug={campaignSlug} />}

      {features
        .filter(f => f.functionName === current)
        .map(({ functionName, ...cardProps }) => (
          <PausableFeatureCard
            key={functionName}
            campaignSlug={campaignSlug}
            feature={campaignFeatures?.find(
              f => f.featureType.functionName === functionName
            )}
            loading={featuresLoading}
            onChanged={refetchFeatures}
            {...cardProps}
          />
        ))}

      {current === "xp" && <ExperienceCard campaignSlug={campaignSlug} />}
    </>
  );
};

export default CampaignProgress;
