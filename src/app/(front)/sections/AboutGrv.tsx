import Image from "next/image";
import styles from "../corporate.module.css";
import Reveal from "../Reveal";
import Kicker from "./Kicker";
import Text from "./Text";

/** Sezione "Cos'è il GRV": intro a due colonne + griglia di caratteristiche. */
const AboutGrv = () => (
  <section
    id="grv"
    className="scroll-mt-[84px] max-w-[1180px] mx-auto py-[clamp(48px,2vw,88px)] px-[clamp(20px,4vw,48px)]"
  >
    <Reveal
      className={`${styles.twoCol} grid grid-cols-[0.9fr_1.1fr] gap-[clamp(32px,4vw,72px)] items-center`}
    >
      <div className="relative aspect-[4/3] rounded-[8px] overflow-hidden border border-ad-border">
        <Image
          src="/gallery/arcana-domine-8.webp"
          alt="Personaggi in azione a un evento Arcana Domine"
          fill
          sizes="(max-width: 768px) 100vw, 50vw"
          className="object-cover"
        />
      </div>
      <div>
        <Kicker>Cos'è il GRV</Kicker>
        <h2 className="font-front font-bold text-[clamp(30px,4vw,52px)] leading-[1.04] tracking-[-0.02em] mb-6">
          Non lo guardi, lo vivi
        </h2>
        <Text className="mb-5 text-ad-ink2">
          Nel Gioco di ruolo dal Vivo (GRV o LARP) scegli l’avventura nella tua
          ambientazione preferita e crei il personaggio che vuoi interpretare.
          Porta in scena in prima persona ogni scelta, ogni combattimento ed
          ogni azione che vuoi vivere sulla tua pelle insieme ad altri
          avventurieri calati come te in una storia originale e mai scritta
          prima. Conta tutto ciò che fai, ogni tua piccola azione plasma la
          trama, e con un briciolo di fantasia e creatività ti senti
          protagonista di folli imprese. Ci sono ambientazioni fantasy e post
          apocalittiche, multi universo e rinascimentali: hai una scelta vasta
          di temi e con essi regole di gioco che più si adattano al tuo stile.
        </Text>
      </div>
    </Reveal>
  </section>
);

export default AboutGrv;
