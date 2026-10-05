"use client";

import * as React from "react";
import styles from "../corporate.module.css";
import { PIVA } from "../data";
import Reveal from "../Reveal";
import Kicker from "./Kicker";
import Text from "./Text";

/** Sezione "Sostienici · 5×1000" con copia del codice fiscale negli appunti. */
const Support = () => {
  const [copied, setCopied] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const onCopy = React.useCallback(() => {
    try {
      navigator.clipboard?.writeText(PIVA);
    } catch {
      /* clipboard non disponibile: ignoriamo */
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1800);
  }, []);

  return (
    <section id="sostienici" className="scroll-mt-[84px] bg-ad-red text-white">
      <div
        className={`${styles.twoCol} max-w-[1180px] mx-auto py-[clamp(44px,4vw,76px)] px-[clamp(20px,4vw,48px)] grid grid-cols-[1fr_auto] gap-[clamp(32px,5vw,64px)] items-center`}
      >
        <Reveal>
          <Kicker color="rgba(255,255,255,0.85)" diamond="#fff">
            Sostienici · 5×1000
          </Kicker>
          <h2 className="font-front font-bold text-[clamp(28px,3.6vw,48px)] leading-[1.06] tracking-[-0.02em] mb-4">
            Dona il tuo 5×1000.
            <br />
            Non ti costa nulla.
          </h2>
          <Text className="max-w-[480px] text-[rgba(255,255,255,0.85)]">
            Nella dichiarazione dei redditi, indica il nostro codice fiscale
            nella sezione 5×1000 dedicata alle associazioni di promozione
            sociale. Grazie per il contributo!
          </Text>
        </Reveal>

        <Reveal className="bg-[rgba(255,255,255,0.1)] border border-[rgba(255,255,255,0.25)] rounded-[14px] p-[clamp(26px,3vw,38px)] text-center backdrop-blur-[4px]">
          <div className="text-[12px] font-bold tracking-[0.16em] uppercase text-[rgba(255,255,255,0.7)]">
            Codice Fiscale / P.IVA
          </div>
          <div className="font-front font-bold text-[clamp(28px,3vw,40px)] tracking-[0.04em] mt-3 mb-[22px]">
            {PIVA}
          </div>
          <button
            type="button"
            onClick={onCopy}
            className={`${styles.copyBtn} inline-flex items-center gap-[9px] bg-white text-ad-red border-0 font-bold text-[15px] px-[26px] py-[13px] rounded-full cursor-pointer`}
          >
            {copied ? "Copiato!" : "Copia P.IVA"}
          </button>
        </Reveal>
      </div>
    </section>
  );
};

export default Support;
