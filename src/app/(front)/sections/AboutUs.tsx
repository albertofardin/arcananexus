import Image from "next/image";
import styles from "../corporate.module.css";
import { COLORS } from "../tokens";
import { ABOUT_PHOTO } from "../data";
import Reveal from "../Reveal";
import Kicker from "./Kicker";
import Text from "./Text";

/** Sezione scura "Chi siamo": storia dell'associazione + immagine evocativa. */
const AboutUs = () => (
  <section id="associazione" className="scroll-mt-[84px] bg-ad-dark text-white">
    <div
      className={`${styles.twoCol} max-w-[1180px] mx-auto py-[clamp(48px,4vw,88px)] px-[clamp(20px,4vw,48px)] grid grid-cols-[1.1fr_0.9fr] gap-[clamp(36px,5vw,80px)] items-center`}
    >
      <Reveal>
        <Kicker color={COLORS.pink}>Chi siamo</Kicker>
        <h2 className="font-front font-bold text-[clamp(30px,4vw,52px)] leading-[1.04] tracking-[-0.02em] mb-6">
          20 anni di avventure
        </h2>
        <Text className="mb-[18px] text-[rgba(255,255,255,0.78)]">
          Arcana Domine Aps è un’associazione di promozione sociale senza fini
          di lucro, dedicata all’organizzazione di eventi di Gioco di ruolo dal
          Vivo nel Triveneto dal 2023. Nati nel 2004 con i primi gruppi di amici
          che hanno creato una vera e propria associazione culturale nel 2006,
          oggi portiamo avanti più campagne multi-ambientazione, con un’unica
          missione: far vivere a ogni giocatore l’esperienza di poter essere
          protagonista di avventure che sentirà sue per sempre.
        </Text>
      </Reveal>

      <Reveal className="relative aspect-[4/5] rounded-[8px] overflow-hidden border border-[rgba(255,255,255,0.25)]">
        <Image
          src={ABOUT_PHOTO}
          alt="Foto evocativa di un live Arcana Domine"
          fill
          sizes="(max-width: 768px) 100vw, 45vw"
          className="object-cover object-[-90px_center]"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(20,18,16,0.1)_0%,rgba(20,18,16,0.55)_100%)]" />
      </Reveal>
    </div>
  </section>
);

export default AboutUs;
