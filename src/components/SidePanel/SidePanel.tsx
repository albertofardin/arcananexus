"use client";

import * as React from "react";
import { useRouter, useParams, usePathname } from "next/navigation";
import BtnUser from "./BtnUser";
import BtnNotifications from "./BtnNotifications";
import SideButton from "./SideButton";
import BtnAdmin from "./BtnAdmin";
import { profileNavItems } from "./profileNavItems";
import { routes } from "@/app/routes";
import BtnCampaign from "@/components/BtnCampaign";
import Skeleton from "@/components/_core/Skeleton";
import { useQueryCampaigns } from "@/lib/queries/campaigns";
import { useCapabilities } from "@/lib/queries/capabilities";
import { FT_DOWNTIME, FT_MISSIVE } from "@/lib/features/featuresName";

// Sfondo del panel: sfumatura a tema dall'alto, derivata dai token
// (--color / --panel-accent) → cambia tono con il tema selezionato.
// Resta inline (non esprimibile bene come singola utility Tailwind).
const panelBackground: React.CSSProperties = {
  background: `radial-gradient(140% 70% at 50% -10%,
      color-mix(in srgb, var(--panel-accent) 16%, transparent), transparent 64%),
    linear-gradient(180deg,
      color-mix(in srgb, var(--color) 14%, transparent) 0%,
      transparent 42%,
      color-mix(in srgb, #000 24%, transparent) 100%)`,
};

// Overrides le variabili CSS di cui Btn dipende (letteralmente var(--fg) /
// var(--bg) / var(--hover-bg) in Btn.tsx) in modo che funzioni
// correttamente sul background scuro del panel senza hack di className.
const panelContext: React.CSSProperties = {
  "--fg": "color-mix(in srgb, white 72%, transparent)",
  "--bg": "var(--panel)",
  "--button-bg": "var(--panel)",
  "--hover-bg": "color-mix(in srgb, white 8%, transparent)",
} as React.CSSProperties;

// Placeholder di un SideButton durante il caricamento delle campagne:
// stessa altezza/padding (min-h-[36px] pl-5 pr-4) per evitare un salto
// di layout quando compaiono i bottoni reali.
const SideButtonSkeleton = () => (
  <div className="flex min-h-[36px] items-center gap-3 pl-5 pr-4">
    <Skeleton className="h-[18px] w-[18px] rounded-full" />
    <Skeleton className="h-3.5 w-24" />
  </div>
);

export interface ISidePanelProps {
  onClose?: () => void;
}

const SidePanel = ({ onClose = () => null }: ISidePanelProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const { campaignSlug: camp } = useParams<{ campaignSlug?: string }>();

  const { data: camps = [], isPending: campsPending } = useQueryCampaigns();
  const slcCamp = camps.find(cam => cam.slug === camp);

  const { data: capabilities } = useCapabilities();

  const isMaster =
    !!slcCamp && !!capabilities?.masterCampaigns.includes(slcCamp.slug);

  const campaignAdminPath = slcCamp
    ? routes.campaignAdmin(slcCamp.slug)
    : undefined;
  const isCampaignAdminActive =
    !!campaignAdminPath &&
    (pathname === campaignAdminPath ||
      pathname.startsWith(`${campaignAdminPath}/`));

  const onSelectDestinationCamp = (id: string | number) => {
    const slug = camps.find(c => c.id === Number(id))?.slug;
    if (slug) {
      router.push(routes.campaign(slug));
    }
    onClose();
  };
  const onSelectDestinationHome = () => {
    router.push(routes.home());
    onClose();
  };
  return (
    <div className="relative flex h-full flex-col overflow-hidden flex-1">
      {/* Sfondo a tema + texture (dietro a tutto) */}
      <div
        className="pointer-events-none absolute inset-0 z-0
          before:absolute before:inset-0 before:content-['']
          before:[background-image:var(--panel-texture)]
          before:[background-size:340px]
          before:[background-repeat:repeat]
          before:[mix-blend-mode:screen]
          before:[filter:none]
          before:opacity-[0.6]
          after:absolute after:inset-0 after:content-['']
          after:border-r after:[border-right-color:color-mix(in_srgb,var(--panel-accent)_20%,transparent)]"
        style={panelBackground}
        aria-hidden
      />

      <BtnCampaign
        className="mt-2 mx-2"
        style={{ maxWidth: "none", width: "auto" }}
        size={[227, 90]}
        camps={camps}
        loading={campsPending}
        slcCamp={slcCamp}
        switchable
        onSelectHome={onSelectDestinationHome}
        onSelectCamp={onSelectDestinationCamp}
      />

      {/* ── Nav (scrollabile) — context CSS vars so Btn funziona sul panel ── */}
      <div className="relative z-10 min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        <div className="flex flex-col py-2 mx-2" style={panelContext}>
          {campsPending ? (
            <>
              {Array.from({ length: 4 }).map((_, i) => (
                <SideButtonSkeleton key={i} />
              ))}
            </>
          ) : !slcCamp ? (
            <>
              <SideButton
                href={routes.home()}
                icon="article"
                label="Bacheca"
                onClose={onClose}
              />
              <SideButton
                href={routes.events()}
                icon="event"
                label="Eventi"
                onClose={onClose}
              />
              {profileNavItems.map(item => (
                <SideButton
                  key={item.id}
                  href={item.route}
                  icon={item.icon}
                  label={item.label}
                  onClose={onClose}
                />
              ))}
            </>
          ) : (
            <>
              <SideButton
                href={routes.campaign(slcCamp.slug)}
                icon="article"
                label="Bacheca"
                onClose={onClose}
              />
              <SideButton
                href={routes.campaignEvents(slcCamp.slug)}
                icon="event"
                label="Eventi"
                onClose={onClose}
              />
              {slcCamp.activeFeatures.includes(FT_MISSIVE) && (
                <SideButton
                  href={routes.campaignMissive(slcCamp.slug)}
                  icon="mail"
                  label="Missive"
                  onClose={onClose}
                />
              )}
              {slcCamp.activeFeatures.includes(FT_DOWNTIME) && (
                <SideButton
                  href={routes.campaignDowntime(slcCamp.slug)}
                  icon="downtime"
                  label="Downtime"
                  onClose={onClose}
                />
              )}
              <SideButton
                href={routes.campaignCharacters(slcCamp.slug)}
                icon="people"
                label="Personaggi"
                onClose={onClose}
              />
              {slcCamp.dataTypes.map(dt => (
                <SideButton
                  key={dt.name}
                  href={routes.campaignData(slcCamp.slug, dt.name)}
                  icon={dt.icon ?? "folder"}
                  label={dt.name}
                  onClose={onClose}
                />
              ))}
            </>
          )}
        </div>
      </div>
      <div
        className="relative z-10 flex flex-col py-2 mx-2 border-t [border-top-color:color-mix(in_srgb,white_35%,transparent)]"
        style={panelContext}
      >
        <BtnAdmin onClose={onClose} />
        {isMaster && (
          <SideButton
            href={campaignAdminPath}
            icon="master"
            label="Gestione Campagna"
            onClose={onClose}
            active={isCampaignAdminActive}
          />
        )}
        <BtnNotifications onClose={onClose} />
        <BtnUser onClose={onClose} />
      </div>
    </div>
  );
};

export default SidePanel;
