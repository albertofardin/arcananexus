"use client";

import FeatureToggleButton from "./FeatureToggleButton";
import PointBonusList from "./PointBonusList";
import ResetPointsButtons, { ResetTarget } from "./ResetPointsButtons";
import Card from "@/components/_core/Card";
import Text from "@/components/_core/Text";
import Badge from "@/components/_core/Badge";
import Skeleton from "@/components/_core/Skeleton";
import HeroSection from "@/components/HeroSection";
import type { FeatureWithTypeDto } from "@/lib/validations/feature";

export interface IPausableFeatureCard {
  campaignSlug: string;
  feature: FeatureWithTypeDto | undefined;
  loading: boolean;
  onChanged: () => void;
  icon: string;
  title: string;
  subtitle: string;
  /** Spiegazione statica di dominio, sempre visibile: cosa fanno i punti e il reset. */
  explanation: string;
  /** Frase mostrata quando la funzione è attiva: chi può agire e come. */
  activeStatusText: string;
  /** Frase mostrata quando è in pausa: chi resta bloccato e chi no. */
  pausedStatusText: string;
  resetTarget: ResetTarget;
  pausedMessage: string;
  resumedMessage: string;
}

// Card condivisa da Missive e Downtime (T-0xx): stessa struttura in
// entrambe (header di dominio + pannello di stato colorato), differiscono
// solo per copy/icona/target di reset. Il pannello di stato è il pezzo che
// prima mancava — un semplice pulsante "Sospendi" non diceva a chi si
// applicasse la pausa (solo i PG, non lo staff): ora il colore (verde/rosso)
// e la frase accanto al badge lo rendono esplicito senza dover aprire altro.
const PausableFeatureCard = ({
  campaignSlug,
  feature,
  loading,
  onChanged,
  icon,
  title,
  subtitle,
  explanation,
  activeStatusText,
  pausedStatusText,
  resetTarget,
  pausedMessage,
  resumedMessage,
}: IPausableFeatureCard) => {
  const isPaused = feature?.paused ?? false;
  const statusColor = !feature
    ? "var(--muted-fg)"
    : isPaused
      ? "var(--fail)"
      : "var(--succ)";

  return (
    <Card className="flex-col items-stretch gap-3 p-2">
      <HeroSection icon={icon} title={title} subtitle={subtitle} />
      <Text className="text-muted-fg" children={explanation} />

      <div
        className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center"
        style={{
          borderColor: `color-mix(in srgb, ${statusColor} 30%, transparent)`,
          backgroundColor: `color-mix(in srgb, ${statusColor} 7%, transparent)`,
        }}
      >
        <div className="flex flex-1 items-center gap-3">
          {loading ? (
            <Skeleton className="h-[22px] w-[100px] rounded-full" />
          ) : (
            <Badge
              color={statusColor}
              icon={
                !feature ? "block" : isPaused ? "pause_circle" : "play_circle"
              }
              label={
                !feature ? "Non configurata" : isPaused ? "IN PAUSA" : "ATTIVA"
              }
            />
          )}
          {loading ? (
            <Skeleton className="h-[16px] w-[70%]" />
          ) : (
            <Text
              size={0}
              className="text-muted-fg flex-1"
              children={
                !feature
                  ? "Attiva prima questa funzione da Feature della campagna"
                  : isPaused
                    ? pausedStatusText
                    : activeStatusText
              }
            />
          )}
        </div>

        {!loading && feature && (
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <FeatureToggleButton
              campaignSlug={campaignSlug}
              feature={feature}
              pausedMessage={pausedMessage}
              resumedMessage={resumedMessage}
              onChanged={onChanged}
            />
            <ResetPointsButtons
              campaignSlug={campaignSlug}
              target={resetTarget}
            />
          </div>
        )}
      </div>

      {!loading && feature && (
        <PointBonusList
          campaignSlug={campaignSlug}
          feature={feature}
          onChanged={onChanged}
        />
      )}
    </Card>
  );
};

export default PausableFeatureCard;
