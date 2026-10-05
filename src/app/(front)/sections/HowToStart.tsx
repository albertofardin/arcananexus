import Image from "next/image";
import styles from "../corporate.module.css";
import { STEPS } from "../data";
import Reveal from "../Reveal";
import Kicker from "./Kicker";
import Text from "./Text";

/** Sezione "Come iniziare": i quattro passi per arrivare al campo. */
const HowToStart = () => (
  <section
    id="inizia"
    className="scroll-mt-[84px] max-w-[1180px] mx-auto py-[clamp(48px,4vw,88px)] px-[clamp(20px,4vw,48px)]"
  >
    <Reveal
      className={`${styles.twoCol} grid grid-cols-[1.1fr_0.9fr] gap-[clamp(20px,4vw,72px)] items-center mb-[clamp(44px,2vw,64px)]`}
    >
      <div className="relative aspect-[4/3] rounded-[8px] overflow-hidden border border-ad-border">
        <Image
          src="/gallery/arcana-domine-evento-2023.webp"
          alt="Scena di un live Arcana Domine del 2023"
          fill
          sizes="(max-width: 768px) 100vw, 55vw"
          className="object-cover"
        />
      </div>
      <div>
        <Kicker>Come iniziare</Kicker>
        <h2 className="font-front font-bold text-[clamp(30px,4vw,52px)] leading-[1.04] tracking-[-0.02em] mb-[14px]">
          Dal tavolo all'azione
        </h2>
        <Text className="text-ad-muted">
          Non serve essere esperti, non serve sapere già tutto: basta la voglia
          di vivere una storia e di metterti in gioco. Ci pensiamo noi ad
          accompagnarti, un passo dopo l'altro, dalla prima curiosità fino al
          momento in cui entrerai davvero in scena. Bastano quattro semplici
          passi e sarai dei nostri.
        </Text>
      </div>
    </Reveal>
    <Reveal className="grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-px bg-ad-border mt-[clamp(40px,5vw,72px)] border border-ad-border rounded-[10px] overflow-hidden">
      {STEPS.map((f, i) => (
        <div key={f.n} className={`bg-ad-bg p-[clamp(10px,2vw,38px)]`}>
          <h3 className="text-ad-red font-front font-bold text-[20px] mb-2 tracking-[-0.01em]">
            {i + 1} - {f.title}
          </h3>
          <Text className="text-ad-muted">{f.desc}</Text>
        </div>
      ))}
    </Reveal>
  </section>
);

export default HowToStart;
