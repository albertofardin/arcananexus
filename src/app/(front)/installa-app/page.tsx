import type { Metadata } from "next";
import Image from "next/image";
import styles from "../corporate.module.css";
import Reveal from "../Reveal";
import Header from "../sections/Header";
import Kicker from "../sections/Kicker";
import SiteFooter from "../sections/SiteFooter";
import Text from "../sections/Text";
import Icon from "@/components/_core/Icon";

export const metadata: Metadata = {
  title: "Installa l'app — Arcana Domine",
  description:
    "Installa Arcana Domine sulla schermata Home del tuo smartphone: istruzioni per Android e iOS.",
  // Unica pagina che espone <link rel="manifest">: solo qui il browser
  // propone il prompt di installazione PWA (vedi src/app/manifest.webmanifest/route.ts).
  manifest: "/manifest.webmanifest",
};

// `Header` legge le campagne da Prisma per la tendina "Campagne": senza
// questo la pagina resterebbe congelata alla build — vedi lo stesso
// problema in `(front)/page.tsx`.
export const revalidate = 60;

interface InstallStep {
  title: React.ReactNode;
  desc: React.ReactNode;
}

const ANDROID_STEPS: InstallStep[] = [
  {
    title: "Apri con Chrome",
    desc: "Visita questo sito da Google Chrome o un altro browser basato su Chromium.",
  },
  {
    title: "Installa l'app",
    desc: (
      <>
        Tocca il menu <strong>⋮</strong> in alto a destra e scegli{" "}
        <strong>&quot;Installa app&quot;</strong> (o{" "}
        <strong>&quot;Aggiungi a schermata Home&quot;</strong>) — a volte Chrome
        propone il banner da solo.
      </>
    ),
  },
  {
    title: "Conferma",
    desc: "L'icona di Arcana Domine comparirà tra le tue app, pronta all'uso.",
  },
];

const IOS_STEPS: InstallStep[] = [
  {
    title: "Apri con Safari",
    desc: "L'installazione funziona solo da Safari: non da Chrome o altri browser su iOS.",
  },
  {
    title: "Tocca Condividi",
    desc: "Nella barra in basso, seleziona l'icona Condividi (il quadrato con la freccia verso l'alto).",
  },
  {
    title: <>&quot;Aggiungi a Home&quot;</>,
    desc: (
      <>
        Scorri il menu, seleziona <strong>&quot;Aggiungi a Home&quot;</strong> e
        conferma in alto a destra.
      </>
    ),
  },
];

/** Griglia di card numerate condivisa dai due percorsi di installazione. */
const StepGrid = ({ steps }: { steps: InstallStep[] }) => (
  <Reveal className="grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-px bg-ad-border border border-ad-border rounded-[10px] overflow-hidden">
    {steps.map((s, i) => (
      <div key={i} className="bg-ad-bg p-[clamp(20px,2vw,32px)]">
        <h3 className="text-ad-red font-front font-bold text-[19px] mb-2 tracking-[-0.01em]">
          {i + 1} · {s.title}
        </h3>
        <Text className="text-ad-muted">{s.desc}</Text>
      </div>
    ))}
  </Reveal>
);

const InstallaAppPage = () => (
  <div className={styles.root}>
    <Header />

    <section
      className={`relative overflow-hidden bg-ad-dark text-white flex items-center py-[clamp(64px,9vw,112px)] px-[clamp(20px,4vw,48px)] ${styles.glowBlobs}`}
    >
      <div className="z-10 max-w-[500px] mx-auto flex flex-col items-center text-center">
        <h1 className="font-front font-bold text-[clamp(32px,5vw,52px)] leading-[1.05] tracking-[-0.02em] m-0">
          Arcana Domine sempre con te
        </h1>
        <Text className="mt-4 mb-0 text-[rgba(255,255,255,0.75)]">
          installa l'app e accedi con un tocco dal tuo smartphone
        </Text>
      </div>
    </section>

    <main className="max-w-[1180px] mx-auto py-[clamp(48px,5vw,88px)] px-[clamp(20px,4vw,48px)] grid gap-[clamp(48px,5vw,88px)]">
      <Reveal
        className={`${styles.twoCol} grid grid-cols-[0.9fr_1.1fr] gap-[clamp(32px,4vw,72px)] items-center`}
      >
        <div className="relative aspect-[4/3] rounded-[8px] overflow-hidden border border-ad-border">
          <Image
            src="/gallery/arcana-domine-2.webp"
            alt="Momento di un live Arcana Domine"
            fill
            sizes="(max-width: 768px) 100vw, 55vw"
            className="object-cover"
          />
        </div>
        <div>
          <Kicker>Perché installarla</Kicker>
          <h2 className="font-front font-bold text-[clamp(28px,3.6vw,40px)] leading-[1.06] tracking-[-0.02em] mb-5">
            Un&apos;icona, zero attese
          </h2>
          <Text className="mb-4 text-ad-ink2">
            Una volta installata, trovi Arcana Domine tra le tue app, con la sua
            icona: la apri e sei già in dashboard, con il tuo account pronto:
            niente indirizzi da digitare, niente ricerche nel browser.
          </Text>
          <Text className="text-ad-muted">
            Ricevi anche le notifiche push per eventi, prenotazioni e
            comunicazioni della tua campagna, proprio come una vera app, perché
            lo è!
          </Text>
        </div>
      </Reveal>

      <section>
        <h2 className="flex items-center gap-3 font-front font-bold text-[clamp(24px,2.8vw,32px)] tracking-[-0.01em] mb-2">
          <Icon
            className="flex-none text-[28px] text-ad-red"
            children="smartphone"
          />
          Android da Chrome
        </h2>
        <Text className="mb-6 text-ad-muted">
          Requisiti: Chrome (o un altro browser Chromium) aggiornato su Android.
        </Text>
        <StepGrid steps={ANDROID_STEPS} />
      </section>

      <section>
        <h2 className="flex items-center gap-3 font-front font-bold text-[clamp(24px,2.8vw,32px)] tracking-[-0.01em] mb-2">
          <Icon
            className="flex-none text-[28px] text-ad-red"
            children="apple"
          />
          iOS da Safari
        </h2>
        <Text className="mb-6 text-ad-muted">
          Requisiti: iOS 16.4 o successivo, aggiunta effettuata da Safari.
        </Text>
        <StepGrid steps={IOS_STEPS} />
      </section>
    </main>

    <SiteFooter />
  </div>
);

export default InstallaAppPage;
