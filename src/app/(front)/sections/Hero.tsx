import Image from "next/image";
import styles from "../corporate.module.css";
import { GALLERY } from "../data";
import Text from "./Text";
import LogoArcanaDomine from "@/components/LogoArcanaDomine";

/**
 * Hero scuro con striscia di foto dei live in scorrimento continuo e overlay a
 * gradiente per la leggibilità del testo.
 */
const Hero = () => {
  // Doppia la lista così l'animazione `translateX(-50%)` cicla senza stacchi.
  const shots = [...GALLERY, ...GALLERY];

  return (
    <section className="relative min-h-[90vh] flex items-end overflow-hidden bg-ad-dark text-white">
      <div className="absolute inset-0 overflow-hidden">
        <div className={`${styles.heroTrack} absolute inset-0 flex w-max`}>
          {shots.map((shot, i) => (
            <div
              key={i}
              className="relative flex-none h-full w-[clamp(360px,150vw,1000px)] border-r border-[rgba(255,255,255,0.05)]"
            >
              <Image
                src={shot.src}
                alt={shot.alt}
                fill
                sizes="(max-width: 768px) 100vw, 1000px"
                className="object-cover"
                // Solo la prima è visibile al caricamento (le altre scorrono
                // fuori schermo): le altre restano lazy.
                priority={i === 0}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="absolute inset-0 bg-[radial-gradient(130%_90%_at_50%_-5%,rgba(200,16,46,0.26),transparent_55%),linear-gradient(180deg,rgba(20,18,16,0.35)_0%,rgba(20,18,16,0.62)_55%,rgba(20,18,16,0.86)_80%,#141210_100%)]" />

      <div className="relative w-full max-w-[1180px] mx-auto px-[clamp(20px,4vw,48px)] pb-[clamp(56px,8vw,100px)]">
        <div className="text-center flex flex-col items-center max-w-[540px]">
          <h1
            className={`${styles.fadeIn} mb-[20px] leading-[0]`}
            aria-label="Arcana Domine"
          >
            <LogoArcanaDomine
              color="#fff"
              className="h-[clamp(64px,12vw,150px)] max-w-full"
            />
          </h1>
          <div
            className={`${styles.fadeSlow} flex items-center gap-[11px] mb-[22px]`}
          >
            <span className="w-2 h-2 bg-ad-red rotate-45" />
            <span className="font-front font-bold text-[13px] tracking-[0.2em] uppercase text-[rgba(255,255,255,0.72)] max-w-[69vw]">
              Associazione di Giochi di Ruolo dal Vivo
            </span>
            <span className="w-2 h-2 bg-ad-red rotate-45" />
          </div>

          <Text
            className={`${styles.fadeIn} max-w-[540px] mt-7 mb-0 text-[rgba(255,255,255,0.78)]`}
          >
            Indossa il costume, trova le parole giuste e lasciati travolgere
            dalla storia: qui non guardi l&apos;avventura, la vivi in prima
            persona. Sei tu il protagonista, immerso in mondi che prendono vita
            in location mozzafiato, fianco a fianco con altri appassionati.
          </Text>

          <div
            className={`${styles.fadeIn} flex flex-col sm:flex-row sm:flex-wrap gap-[14px] mt-9`}
          >
            <a
              href="#eventi"
              className={`${styles.btnRedBright} h-[40px] inline-flex items-center justify-center gap-2.5 bg-ad-red text-white font-bold text-[16px] px-[30px] py-4 rounded-full`}
            >
              Partecipa a un evento →
            </a>
            <a
              href="#campagne"
              className={`${styles.btnOutlineLight} h-[40px] inline-flex items-center justify-center gap-2.5 border border-[rgba(255,255,255,0.32)] text-white font-bold text-[16px] px-7 py-4 rounded-full`}
            >
              Scopri le campagne
            </a>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
