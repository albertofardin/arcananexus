import Link from "next/link";
import Image from "next/image";
import styles from "../corporate.module.css";
import Reveal from "../Reveal";
import Kicker from "./Kicker";
import { prisma } from "@/lib/db";
import { listPublicCampaigns } from "@/lib/repositories/campaign.repository";
import { themeColors } from "@/app/themes";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";

/** Griglia delle campagne visibili: ogni card apre la pagina dedicata alla campagna. */
const Campaigns = async () => {
  const campaigns = await listPublicCampaigns(prisma, ARCANA_DOMINE_SLUG);

  if (campaigns.length === 0) return null;

  return (
    <section
      id="campagne"
      className="scroll-mt-[84px] bg-ad-bg-alt border-t border-b border-ad-border"
    >
      <div className="max-w-[1180px] mx-auto py-[clamp(48px,4vw,88px)] px-[clamp(20px,4vw,48px)]">
        <Reveal className="flex flex-wrap items-end justify-between gap-5 mb-[clamp(32px,4vw,52px)]">
          <div>
            <Kicker>Le nostre campagne</Kicker>
            <h2 className="font-front font-bold text-[clamp(30px,4vw,52px)] leading-[1.04] tracking-[-0.02em] m-0">
              Vari mondi da esplorare
            </h2>
          </div>
        </Reveal>

        <Reveal className="grid grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 sm:gap-[18px]">
          {campaigns.map(c => {
            const swatch = themeColors.find(t => t.id === c.color)?.swatch;
            return (
              <Link
                key={c.slug}
                href={`/${c.slug}`}
                aria-label={c.name}
                className={`${styles.card} relative flex items-center justify-center aspect-video rounded-[12px] overflow-hidden bg-ad-dark`}
              >
                {c.cover ? (
                  <Image
                    src={c.cover}
                    alt=""
                    fill
                    sizes="(min-width: 1180px) 280px, (min-width: 640px) 30vw, 45vw"
                    className={`${styles.cardImg} object-cover`}
                  />
                ) : (
                  <div
                    aria-hidden
                    className={`${styles.cardImg} absolute inset-0`}
                    style={{
                      background: `linear-gradient(135deg, #141210 0%, ${swatch ?? "#141210"} 100%)`,
                    }}
                  />
                )}
                <div className="absolute inset-0 bg-[rgba(20,18,16,0.55)]" />
                {c.logo ? (
                  <div className="relative w-[62%] h-[58%]">
                    <Image
                      src={c.logo}
                      alt={c.name}
                      fill
                      sizes="(min-width: 1180px) 175px, (min-width: 640px) 19vw, 28vw"
                      className="object-contain drop-shadow-[0_4px_14px_rgba(0,0,0,0.5)]"
                    />
                  </div>
                ) : (
                  <span className="relative font-front font-bold text-white text-[clamp(15px,1.8vw,22px)] text-center px-3">
                    {c.name}
                  </span>
                )}
              </Link>
            );
          })}
        </Reveal>
      </div>
    </section>
  );
};

export default Campaigns;
