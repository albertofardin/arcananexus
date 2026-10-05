import Icon from "@/components/_core/Icon";
import Text from "@/components/_core/Text";
import { getAppVersion } from "@/lib/appVersion";

const AUDIENCES = [
  {
    icon: "people",
    title: "Per i giocatori",
    body: "Crea il tuo personaggio passo dopo passo, seguine la crescita tra talenti e informazioni riservate, invia missive e racconta le tue azioni di downtime tra un evento e l'altro.",
  },
  {
    icon: "master",
    title: "Per i master",
    body: "Pubblica eventi, raccogli iscrizioni e pagamenti, gestisci tessere, ruoli e staff, decidi chi può vedere cosa e stampa schede pronte per il gioco, con la campagna sempre sotto controllo.",
  },
];

const SupportHero = () => (
  <section
    className="relative isolate shrink-0 overflow-hidden rounded-xl px-6 pb-6 pt-10 text-center text-white shadow-[0_10px_30px_-12px_rgba(35,68,146,0.6)] sm:pb-6 sm:pt-12"
    style={{
      background: "#050b1f",
    }}
  >
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 opacity-60 mix-blend-screen"
      style={{
        backgroundImage: 'url("/textures/fantasy.webp")',
        backgroundSize: "340px",
        backgroundRepeat: "repeat",
      }}
    />
    {/* Riflesso vetro che scorre in diagonale */}
    <div
      aria-hidden
      className="pointer-events-none absolute inset-y-0 -left-1/3 -z-10 w-1/3 bg-gradient-to-r from-transparent via-white/20 to-transparent motion-safe:animate-glass-shine"
    />
    {/* Bordo lucido della lastra */}
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-inset ring-white/15"
    />
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent"
    />

    <div className="mx-auto w-64 sm:w-[520px]">
      <h1>
        <img
          src="/app/arcananexus.svg"
          alt="Arcana Nexus"
          className="h-auto w-full"
        />
      </h1>
      {/* Centrato sulla scritta, esclusa l'icona: testo tra x 152 e 650 su 654 del viewBox */}
    </div>

    <div className="absolute top-2 right-3">
      <Text
        size={0}
        className="inline-block rounded-full border border-white/25 bg-white/10 px-3 py-0.5 text-[10px] tracking-[0.2em] [padding-left:calc(0.75rem+0.2em)] text-white/90 backdrop-blur-sm"
      >
        {getAppVersion()}
      </Text>
    </div>

    <Text className="mx-auto mt-6 max-w-2xl text-balance text-white/90 sm:mt-8">
      La tua campagna LARP prende vita in un unico posto. Niente più fogli di
      calcolo, chat infinite e appunti sparsi: tutto quello che serve a master e
      giocatori è qui, sempre aggiornato e a portata di clic.
    </Text>

    <div className="mx-auto mt-8 grid max-w-3xl gap-3 text-left sm:grid-cols-2">
      {AUDIENCES.map(({ icon, title, body }) => (
        <div
          key={title}
          className="flex flex-col gap-2 rounded-lg bg-white/5 p-4 ring-1 ring-inset ring-white/10 backdrop-blur-sm"
        >
          <div className="flex items-center gap-2">
            <Icon className="text-white" children={icon} />
            <Text weight="bolder" className="text-white" children={title} />
          </div>
          <Text className="text-white/70" children={body} />
        </div>
      ))}
    </div>
  </section>
);

export default SupportHero;
