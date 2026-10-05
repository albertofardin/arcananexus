import styles from "../corporate.module.css";
import { PIVA } from "../data";
import Text from "./Text";
import LogoArcanaDomine from "@/components/LogoArcanaDomine";

interface LegalRow {
  label: string;
  value: string;
}

const LEGAL: LegalRow[] = [
  { label: "Ragione sociale", value: "Arcana Domine APS" },
  { label: "Forma giuridica", value: "Associazione di Promozione Sociale" },
  { label: "Sede legale", value: "Via Oderzo 16, Ponzano Veneto (TV), 31050" },
  { label: "Cod. fiscale / P.IVA", value: PIVA },
];

interface DocLink {
  label: string;
  href: string;
}

const DOCS: DocLink[] = [
  {
    label: "→ Statuto APS",
    href: "https://www.arcanadomine.it/wp-content/uploads/2025/03/Statuto_APS_ver_6.pdf",
  },
  {
    label: "→ Regolamento interno",
    href: "https://www.arcanadomine.it/wp-content/uploads/2026/01/Regolamento-Interno-AD-APS-nuovo.pdf",
  },
  { label: "→ Facebook", href: "https://it-it.facebook.com/arcanadomine/" },
];

/** Etichetta maiuscola spaziata ricorrente nelle colonne del footer. */
const labelClass =
  "font-front font-bold text-[12px] tracking-[0.16em] uppercase text-[rgba(255,255,255,0.5)]";

/** Footer / contatti con dati legali, documenti e richiamo al 5×1000. */
const SiteFooter = () => (
  <footer id="contatti" className="scroll-mt-[84px] bg-ad-dark text-white">
    <div className="max-w-[1180px] mx-auto pt-[clamp(56px,4vw,96px)] px-[clamp(20px,4vw,48px)]">
      <div
        className={`${styles.twoCol} grid grid-cols-[1.3fr_1fr_1fr] gap-[clamp(32px,4vw,56px)] pb-[clamp(44px,5vw,64px)] border-b border-[rgba(255,255,255,0.12)]`}
      >
        <div>
          <div className="flex items-center gap-[11px] mb-5">
            <LogoArcanaDomine color="#fff" className="h-[35px]" />
          </div>
          <Text className="mt-0 mb-2 text-[rgba(255,255,255,0.62)] max-w-[340px]">
            Associazione di promozione sociale senza fini di lucro dedicata al
            Gioco di Ruolo dal Vivo nel Triveneto. Attiva dal 2004.
          </Text>
          <a
            href="mailto:direttivo@arcanadomine.it"
            className={`${styles.footLink} inline-block mt-3 text-[15px] font-bold text-ad-pink`}
          >
            direttivo@arcanadomine.it
          </a>
        </div>

        <div>
          <div className={`${labelClass} mb-[18px]`}>Dati legali</div>
          <dl className="m-0 grid grid-cols-[1fr] gap-[14px]">
            {LEGAL.map(row => (
              <div key={row.label}>
                <div className="text-[12px] text-[rgba(255,255,255,0.45)]">
                  {row.label}
                </div>
                <div className="text-[15px] text-[rgba(255,255,255,0.85)]">
                  {row.value}
                </div>
              </div>
            ))}
          </dl>
        </div>

        <div>
          <div className={`${labelClass} mb-[18px]`}>Documenti</div>
          <div className="flex flex-col gap-3">
            {DOCS.map(doc => (
              <a
                key={doc.href}
                href={doc.href}
                target="_blank"
                rel="noopener noreferrer"
                className={`${styles.footLink} text-[15px] text-[rgba(255,255,255,0.78)]`}
              >
                {doc.label}
              </a>
            ))}
          </div>
          <div className={`${labelClass} mt-6 mb-3`}>5×1000</div>
          <div className="text-[15px] text-[rgba(255,255,255,0.78)]">
            Sostieni la nostra attività culturale:{" "}
            <strong className="text-white">{PIVA}</strong>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap justify-between gap-4 pt-[26px] pb-9">
        <span className="text-[13px] text-[rgba(255,255,255,0.45)]">
          © 2026 Arcana Domine APS — Tutti i diritti riservati. Associazione
          senza fini di lucro.
        </span>
        <span className="text-[13px] text-[rgba(255,255,255,0.45)]">
          Privacy Policy · Cookie Policy
        </span>
      </div>
    </div>
  </footer>
);

export default SiteFooter;
