interface ConventionLink {
  label: string;
  href: string;
  icon: string;
}

export interface Convention {
  name: string;
  logo: string;
  /** Sconto riservato ai soci, es. "15%". Omesso se variabile. */
  discount?: string;
  /** Codice convenzione da inserire al checkout/registrazione. */
  code?: string;
  paragraphs: string[];
  links: ConventionLink[];
}

const LINK_SITE = "language";
const LINK_ETSY = "etsy";
const LINK_INSTAGRAM = "instagram";
const LINK_FACEBOOK = "facebook";

export const conventions: Convention[] = [
  {
    name: "Artedarme",
    logo: "/conventions/artedarme.webp",
    discount: "15%",
    paragraphs: [
      "Ogni arma e ogni prop Artedarme nasce a mano, pezzo dopo pezzo, per accompagnare avventurieri, guerrieri, nobili e mercenari in qualsiasi ambientazione: dal fantasy più classico al post-apocalittico.",
      "Il catalogo è in continua crescita e propone creazioni già pronte per scendere in campo, ma il vero valore aggiunto sono i progetti su misura: raccontaci il tuo personaggio e lo trasformeremo in un pezzo unico, fatto apposta per lui.",
    ],
    links: [
      {
        label: "Etsy",
        href: "https://www.etsy.com/it/shop/Artedarme",
        icon: LINK_ETSY,
      },
      {
        label: "Instagram",
        href: "https://www.instagram.com/artedarme_workshop/",
        icon: LINK_INSTAGRAM,
      },
      {
        label: "Facebook",
        href: "https://www.facebook.com/Artedarme",
        icon: LINK_FACEBOOK,
      },
    ],
  },
  {
    name: "Calimacil",
    logo: "/conventions/calimacil.webp",
    discount: "10%",
    code: "ARCANADOMINE",
    paragraphs: [
      "Calimacil è tra i marchi più riconosciuti al mondo per armi LARP in schiuma: design curato, bilanciamento perfetto e una resistenza pensata per resistere combattimento dopo combattimento.",
      "Inserisci il codice di sconto in fase di checkout per ottenere lo sconto riservato ai soci.",
    ],
    links: [
      {
        label: "Sito",
        href: "https://calimacil.com/ARCANADOMINE",
        icon: LINK_SITE,
      },
    ],
  },
  {
    name: "FunkyScraps",
    logo: "/conventions/funkyscraps.webp",
    discount: "10%",
    paragraphs: [
      "Funky Scraps dà nuova vita a tessuti di recupero trasformandoli in abiti e accessori LARP dal carattere unico: sostenibilità e creatività cucite insieme in ogni pezzo.",
    ],
    links: [
      {
        label: "Facebook",
        href: "https://www.facebook.com/share/15o1T9cjbN/",
        icon: LINK_FACEBOOK,
      },
      {
        label: "Instagram",
        href: "https://www.instagram.com/funkyscraps/",
        icon: LINK_INSTAGRAM,
      },
    ],
  },
  {
    name: "Hobby e Passione Cuoio",
    logo: "/conventions/hpc.webp",
    discount: "20%",
    paragraphs: [
      "Dalle armature alle scarselle, dalle cinture ai quadernetti, fino a faretre, bracciali e accessori per capelli: Hobby e Passione Cuoio realizza su commissione lavori in cuoio rifiniti a mano, adatti a rievocazione, LARP e vita quotidiana.",
    ],
    links: [
      {
        label: "Facebook",
        href: "https://www.facebook.com/share/1APH4Dd21F/",
        icon: LINK_FACEBOOK,
      },
      {
        label: "Instagram",
        href: "https://www.instagram.com/hpc_hobby_e_passione_cuoio",
        icon: LINK_INSTAGRAM,
      },
    ],
  },
  {
    name: "I Forgiatori Di Sogni",
    logo: "/conventions/forgiatoridisogni.webp",
    discount: "15%",
    paragraphs: [
      "I Forgiatori Di Sogni dà forma al mondo fantasy: armature, armi, maschere e oggettistica realizzate con materiali diversi, pensate per LARP, Cosplay, teatro e spettacolo dal vivo.",
      "Armi e protesi in lattice sono costruite nel rispetto dei canoni e dei requisiti di sicurezza richiesti dalle associazioni di gioco di ruolo dal vivo, per un'esperienza di gioco sicura e senza compromessi.",
      "Ogni armatura può essere progettata su commissione, con un confronto diretto con il cliente per rendere l'idea finale totalmente personalizzata.",
    ],
    links: [
      {
        label: "Facebook",
        href: "https://www.facebook.com/p/LarpLab-Fantasy-100095427917983/",
        icon: LINK_FACEBOOK,
      },
      {
        label: "Instagram",
        href: "https://www.instagram.com/i_forgiatori_di_sogni/",
        icon: LINK_INSTAGRAM,
      },
    ],
  },
  {
    name: "Dwarven Hammer",
    logo: "/conventions/dwarvenhammer.webp",
    discount: "15%",
    code: "ArcanaDomine2025",
    paragraphs: [
      "Dwarven Hammer non è un semplice rivenditore: è una bottega nata dalla grande passione per il gioco di ruolo dal vivo e da tavolo.",
      "Il team è composto da veterani della scena LARP e appassionati di giochi di ruolo in ogni forma. Grazie all'esperienza diretta sul campo, conosciamo a fondo le vere esigenze degli avventurieri e quanto siano fondamentali qualità, funzionalità e autenticità nell'equipaggiamento.",
      "Inserisci il codice di sconto in fase di checkout per ottenere lo sconto riservato ai soci.",
    ],
    links: [
      {
        label: "Sito",
        href: "https://dwarvenhammer.com/",
        icon: LINK_SITE,
      },
    ],
  },
  {
    name: "The.CostumeStudio",
    logo: "/conventions/thecostumestudio.webp",
    discount: "10%",
    paragraphs: [
      "The.CostumeStudio è uno small business artigianale che dà vita a costumi e accessori LARP interamente fatti a mano, curati nel minimo dettaglio. Ogni pezzo può essere realizzato su misura, per rendere ogni personaggio davvero unico.",
    ],
    links: [
      {
        label: "Instagram",
        href: "https://www.instagram.com/the.costumestudio/profilecard/?igsh=emxjYTk0b2NzZjl0",
        icon: LINK_INSTAGRAM,
      },
    ],
  },
  {
    name: "VersatileVials Bottleshop",
    logo: "/conventions/versatilevials.webp",
    discount: "20%",
    paragraphs: [
      "Le Vials di VersatileVials aggiungono un tocco scenico in più a medici, alchimisti, velenisti e a chiunque voglia arricchire il proprio personaggio con un dettaglio davvero d'effetto, per LARPer e Cosplayer.",
      "La loro versatilità non si ferma al gioco: sono perfette anche come elementi decorativi, oggetti da collezione, bomboniere, piccoli portafortuna o gadget aziendali.",
      "Le boccette sono normalmente sigillate e non edibili, pensate per durare nel tempo; su richiesta sono disponibili anche versioni edibili per occasioni speciali.",
    ],
    links: [
      {
        label: "Instagram",
        href: "https://www.instagram.com/versatilevials_bottleshop/",
        icon: LINK_INSTAGRAM,
      },
    ],
  },
  {
    name: "Sartoria NIMIDE",
    logo: "/conventions/nimide.webp",
    discount: "15%",
    paragraphs: [
      "NIMIDE nasce dall'incontro tra sartoria artigianale e gioco di ruolo dal vivo: costumi, abiti su misura e accessori per LARP, rievocazione e cosplay, in cui studio modellistico e cura del dettaglio storico o fantastico vanno di pari passo con la funzionalità di gioco.",
      "Che si tratti di un capo completo per dare vita a un nuovo personaggio, di un restauro o di una consulenza su tessuti e dettagli di scena, ogni creazione è pensata per garantire comfort, resistenza e massima resa scenica sul campo.",
      "Ai soci è riservato il 15% di sconto sugli ordini su misura e sulla realizzazione di costumi, oltre alla consulenza preliminare gratuita (valore 50€).",
    ],
    links: [
      {
        label: "Sito",
        href: "https://www.nimide.com/",
        icon: LINK_SITE,
      },
      {
        label: "Instagram",
        href: "https://www.instagram.com/nimide_sartoria/",
        icon: LINK_INSTAGRAM,
      },
    ],
  },
  {
    name: "AssiBro - Broker di Assicurazioni",
    logo: "/conventions/assibro.webp",
    code: "ARCANADOMINEAPS",
    paragraphs: [
      "Assibro è un broker di assicurazioni che affianca i soci di Arcana Domine nella scelta delle coperture più adatte. Sul sito, inserisci il codice ARCANADOMINEAPS e registrati sulla piattaforma per richiedere i tuoi preventivi.",
      "La convenzione riserva sconti sulle polizze AUTO, CASA e INFORTUNI ed è utilizzabile da tutti i soci e dai loro familiari.",
    ],
    links: [
      {
        label: "Sito",
        href: "https://my.assibro.it/sign-up?referral=ARCANADOMINEAPS",
        icon: LINK_SITE,
      },
    ],
  },
];
