import { COLORS } from "../tokens";

interface IKicker {
  children: React.ReactNode;
  /** Colore del testo (il rombo resta cremisi salvo override). */
  color?: string;
  /** Colore del rombo. */
  diamond?: string;
  /** Centra l'occhiello (usato nella sezione "Come iniziare"). */
  centered?: boolean;
}

/** Occhiello ricorrente: rombo cremisi + etichetta maiuscola spaziata. */
const Kicker = ({
  children,
  color = COLORS.red,
  diamond = COLORS.red,
  centered = false,
}: IKicker) => (
  <div
    className={`${centered ? "inline-flex" : "flex"} items-center gap-2.5 mb-[18px]`}
  >
    <span
      className="w-[7px] h-[7px] rotate-45"
      style={{ background: diamond }}
    />
    <span
      className="font-front font-bold text-[13px] tracking-[0.18em] uppercase"
      style={{ color }}
    >
      {children}
    </span>
  </div>
);

export default Kicker;
