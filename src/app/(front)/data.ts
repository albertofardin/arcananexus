/**
 * Contenuti della landing pubblica.
 *
 * Trasposizione dei dati che nel template originale vivevano in `renderVals()`.
 * Le campagne usano gli asset reali presenti in `public/campaigns/` e `public/gallery/`.
 */

export interface NavLink {
  label: string;
  href: string;
}

// Le ancore sono prefissate con "/" (non solo "#sezione") così `Header`
// funziona anche da pagine diverse dalla home (es. "/installa-app"): il
// browser tratta un href che cambia solo l'hash come scroll in-page se il
// path coincide con quello corrente, o come navigazione verso "/" + scroll
// altrimenti — senza bisogno di distinguere i due casi lato componente.
export const NAV_LINKS: NavLink[] = [
  { label: "il GRV", href: "/#grv" },
  { label: "Come iniziare", href: "/#inizia" },
  { label: "Calendario", href: "/#eventi" },
  { label: "Campagne", href: "/#campagne" },
  { label: "Scarica l'app", href: "/installa-app" },
];

export interface Step {
  n: string;
  title: string;
  desc: string;
}

export const STEPS: Step[] = [
  {
    n: "1",
    title: "Registrati",
    desc: "Con pochi clic puoi accedere al nostro portale che ti spalanca le porte della nostra community WhatsApp e dei regolamenti di ogni campagna. Benvenuto nel gruppo!",
  },
  {
    n: "2",
    title: "Scegli la campagna",
    desc: "Terre maledette, regni in guerra, lande inesplorate… scegli il mondo che ti chiama. I nostri master sempre pronti a prenderti per mano e a guidarti nell'avventura.",
  },
  {
    n: "3",
    title: "Crea il personaggio",
    desc: "Storia, abilità, carattere e costume: dai vita all'eroe o al furfante che hai sempre sognato di essere. Ogni personaggio è unico, proprio come te.",
  },
  {
    n: "4",
    title: "Vivi l'evento",
    desc: "Presentati al live, indossa i panni del tuo personaggio e lasciati travolgere. Spegni il telefono, accendi la fantasia: l'avventura comincia ora!",
  },
];

export interface GalleryShot {
  src: string;
  alt: string;
}

/**
 * Foto dei live, da `public/gallery/`. Le prime sono scatti reali
 * di Arcana Domine, le ultime atmosfere GRV. Scorrono nel carosello dell'Hero.
 */
export const GALLERY: GalleryShot[] = [
  {
    src: "/gallery/arcana-domine-11.webp",
    alt: "Giocatori in costume durante un evento Arcana Domine",
  },
  {
    src: "/gallery/arcana-domine-evento-2023.webp",
    alt: "Scena di un live Arcana Domine del 2023",
  },
  {
    src: "/gallery/arcana-domine-8.webp",
    alt: "Personaggi in azione a un evento Arcana Domine",
  },
  {
    src: "/gallery/arcana-domine-5.webp",
    alt: "Combattimento dal vivo in ambientazione fantasy",
  },
];

/** Foto verticale evocativa usata nella sezione "Chi siamo". */
export const ABOUT_PHOTO = "/gallery/arcana-domine-12.webp";

/** Partita IVA / codice fiscale dell'associazione (5×1000). */
export const PIVA = "92192890280";
