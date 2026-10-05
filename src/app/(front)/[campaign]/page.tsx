import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Header from "../sections/Header";
import SiteFooter from "../sections/SiteFooter";
import Kicker from "../sections/Kicker";
import Text from "../sections/Text";
import Reveal from "../Reveal";
import styles from "../corporate.module.css";
import { COLORS } from "../tokens";
import CampaignGallery from "./_components/CampaignGallery";
import Icon from "@/components/_core/Icon";
import { prisma } from "@/lib/db";
import { getCampaignPublicDetails } from "@/lib/repositories/campaign.repository";
import { getNextPublishedEvent } from "@/lib/repositories/event.repository";
import { ARCANA_DOMINE_SLUG, ROLE_COLORS } from "@/lib/constants";
import { ROLE_LABELS } from "@/components/RoleManager/roleDefinitions";
import { themeColors, themeTextures } from "@/app/themes";
import formatDate from "@/lib/utils/formatDate";

// Senza questo, Next non vede alcuna API dinamica (solo Prisma, niente
// `fetch`/`cookies`/`headers`) e congela la pagina alla build: una campagna
// resa visibile o un evento pubblicato dopo il deploy non comparirebbero mai
// finché non si ricostruisce il sito — vedi lo stesso problema in
// `(front)/page.tsx`.
export const revalidate = 60;

interface PageProps {
  params: Promise<{ campaign: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { campaign: slug } = await params;
  const campaign = await getCampaignPublicDetails(
    prisma,
    slug,
    ARCANA_DOMINE_SLUG
  );
  if (!campaign) return {};

  return {
    title: `${campaign.name} — Arcana Domine APS`,
    description:
      campaign.description ??
      `Scopri ${campaign.name}, una campagna di Gioco di Ruolo dal Vivo di Arcana Domine APS.`,
  };
}

/**
 * Pagina pubblica dedicata a una singola campagna: hero con copertina/texture
 * del tema, galleria con anteprima grande + filmstrip, e in fondo una
 * panoramica (giocatori attivi, staff) — vedi thread di design in
 * `Campaigns.tsx`. Riusa `Header`/`SiteFooter` della home per restare
 * coerente con la navigazione del sito.
 */
const CampaignPage = async ({ params }: PageProps) => {
  const { campaign: slug } = await params;
  const [campaign, nextEvent] = await Promise.all([
    getCampaignPublicDetails(prisma, slug, ARCANA_DOMINE_SLUG),
    getNextPublishedEvent(prisma, {
      orgSlug: ARCANA_DOMINE_SLUG,
      campaignSlug: slug,
      startDate: new Date(),
    }),
  ]);
  if (!campaign) notFound();

  const swatch =
    themeColors.find(t => t.id === campaign.color)?.swatch ??
    themeColors[0].swatch;
  const textureFile = themeTextures.find(t => t.id === campaign.texture)?.file;
  const activePlayers = campaign._count.characters;
  const eventsCount = campaign._count.events;

  return (
    <div id="top" className={styles.root}>
      <Header />

      <main>
        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <section className="relative flex items-end min-h-[360px] bg-ad-dark text-white overflow-hidden">
          {campaign.cover ? (
            <Image
              src={campaign.cover}
              alt=""
              fill
              priority
              sizes="100vw"
              className="object-cover object-center"
            />
          ) : (
            <div
              aria-hidden
              className="absolute inset-0"
              style={{
                background: `linear-gradient(135deg, #141210 0%, ${swatch} 100%)`,
              }}
            />
          )}
          {/* Overlay scuro per la leggibilità del testo sopra la copertina. */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/10" />
          {/* Texture decorativa del tema campagna (stesso trattamento di
              `HeroBanner`/`PreviewTheme` nella dashboard): sopra l'overlay,
              blend "screen" a bassa opacità così resta un dettaglio, non
              rumore. */}
          {textureFile && (
            <div
              aria-hidden
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage: `url(${textureFile})`,
                backgroundSize: "340px",
                backgroundRepeat: "repeat",
                mixBlendMode: "screen",
                opacity: 0.35,
              }}
            />
          )}

          <div className="relative max-w-[1180px] w-full mx-auto px-[clamp(20px,4vw,48px)] pt-[100px] sm:pt-[140px] pb-[clamp(32px,6vw,60px)] flex flex-wrap items-end gap-5 sm:gap-8">
            {campaign.logo && (
              <div className="relative w-[92px] h-[92px] sm:w-[150px] sm:h-[150px] shrink-0 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 p-3 shadow-[0_12px_32px_rgba(0,0,0,0.35)]">
                <Image
                  src={campaign.logo}
                  alt={campaign.name}
                  fill
                  className="object-contain p-2"
                />
              </div>
            )}
            <div className="flex-1 min-w-[220px]">
              <Kicker color="#fff" diamond={swatch}>
                {campaign.type === "oneShot" ? "One Shot" : "Campagna"}
              </Kicker>
              <h1 className="font-front font-bold text-[clamp(28px,6vw,60px)] leading-[1.02] tracking-[-0.02em] m-0 [text-wrap:balance]">
                {campaign.name}
              </h1>
            </div>
          </div>
        </section>

        {/* ── Divider a tema ──────────────────────────────────────────── */}
        <div className="relative h-[3px] w-full" aria-hidden>
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(90deg, transparent 0%, ${swatch} 20%, ${swatch} 80%, transparent 100%)`,
            }}
          />
          <div
            className="absolute inset-x-0 -bottom-3 h-6 blur-xl opacity-70"
            style={{ background: swatch }}
          />
        </div>

        {/* ── Descrizione ──────────────────────────────────────────────── */}
        {campaign.description && (
          <section className="bg-ad-bg border-b border-ad-border">
            <div className="max-w-[820px] mx-auto py-[clamp(20px,5vw,50px)] px-[clamp(20px,4vw,48px)]">
              <Reveal>
                <Text className="text-ad-ink2 whitespace-pre-line">
                  {campaign.description}
                </Text>
              </Reveal>
            </div>
          </section>
        )}

        {/* ── Galleria ─────────────────────────────────────────────────── */}
        {campaign.images.length > 0 && (
          <section className="bg-ad-bg-alt border-b border-ad-border">
            <div className="max-w-[900px] mx-auto py-[clamp(20px,5vw,50px)] px-[clamp(20px,4vw,48px)]">
              <Reveal>
                <Kicker color={COLORS.ink} diamond={COLORS.ink}>
                  Galleria
                </Kicker>
              </Reveal>
              <Reveal>
                <CampaignGallery
                  images={campaign.images}
                  accentColor={swatch}
                />
              </Reveal>
            </div>
          </section>
        )}

        {/* ── Panoramica: statistiche + staff ─────────────────────────── */}
        <section
          className={`relative overflow-hidden bg-ad-bg ${styles.glowBlobs}`}
          style={{ "--color": swatch } as React.CSSProperties}
        >
          <div className="relative z-10 max-w-[1180px] mx-auto py-[clamp(20px,5vw,50px)] px-[clamp(20px,4vw,48px)]">
            <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4 mb-[40px]">
              <div className="flex items-center gap-4 p-5 rounded-2xl border border-ad-border bg-white/80 backdrop-blur-sm">
                <span
                  className="flex items-center justify-center w-11 h-11 rounded-full shrink-0"
                  style={{
                    backgroundColor: `color-mix(in srgb, ${swatch} 16%, white)`,
                  }}
                >
                  <Icon
                    className="text-[20px]"
                    style={{ color: swatch }}
                    children="people"
                  />
                </span>
                <div>
                  <div className="font-front font-bold text-[clamp(24px,2.6vw,34px)] leading-none">
                    {activePlayers}
                  </div>
                  <div className="text-[13px] text-ad-muted mt-1">
                    {activePlayers === 1
                      ? "giocatore attivo"
                      : "giocatori attivi"}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4 p-5 rounded-2xl border border-ad-border bg-white/80 backdrop-blur-sm">
                <span
                  className="flex items-center justify-center w-11 h-11 rounded-full shrink-0"
                  style={{
                    backgroundColor: `color-mix(in srgb, ${swatch} 16%, white)`,
                  }}
                >
                  <Icon
                    className="text-[20px]"
                    style={{ color: swatch }}
                    children="event"
                  />
                </span>
                <div>
                  <div className="font-front font-bold text-[clamp(24px,2.6vw,34px)] leading-none">
                    {eventsCount}
                  </div>
                  <div className="text-[13px] text-ad-muted mt-1">
                    Eventi giocati
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4 p-5 rounded-2xl border border-ad-border bg-white/80 backdrop-blur-sm min-w-0">
                <span
                  className="flex items-center justify-center w-11 h-11 rounded-full shrink-0"
                  style={{
                    backgroundColor: `color-mix(in srgb, ${swatch} 16%, white)`,
                  }}
                >
                  <Icon
                    className="text-[20px]"
                    style={{ color: swatch }}
                    children="location"
                  />
                </span>
                <div className="min-w-0">
                  <div className="font-front font-bold text-[20px] leading-tight truncate">
                    {nextEvent
                      ? formatDate(nextEvent.dateEventStart)
                      : "Data da definire"}
                  </div>
                  <div className="text-[13px] text-ad-muted mt-1 truncate">
                    {nextEvent
                      ? (nextEvent.place ?? "Prossimo evento")
                      : "Prossimo evento in arrivo"}
                  </div>
                </div>
              </div>
            </div>

            {campaign.grants.length > 0 && (
              <>
                <Reveal>
                  <Kicker color={COLORS.ink} diamond={COLORS.ink}>
                    Staff
                  </Kicker>
                </Reveal>
                <Reveal className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
                  {campaign.grants.map(({ role, user }) => {
                    const displayName = user.PersonalData
                      ? `${user.PersonalData.firstName} ${user.PersonalData.lastName}`
                      : user.name;
                    const roleColor = ROLE_COLORS[role];
                    return (
                      <div
                        key={user.id}
                        className={`${styles.card} flex items-center gap-3 p-4 rounded-2xl border border-ad-border bg-white`}
                      >
                        <div
                          className="relative w-[52px] h-[52px] rounded-full overflow-hidden shrink-0 flex items-center justify-center text-white font-front font-bold text-[18px]"
                          style={{ backgroundColor: roleColor }}
                        >
                          {user.image ? (
                            <Image
                              src={user.image}
                              alt={displayName}
                              fill
                              className="object-cover"
                            />
                          ) : (
                            displayName.charAt(0).toUpperCase()
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-[15px] truncate">
                            {displayName}
                          </div>
                          <div
                            className="text-[13px] font-bold"
                            style={{ color: roleColor }}
                          >
                            {ROLE_LABELS[role]}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </Reveal>
              </>
            )}
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
};

export default CampaignPage;
