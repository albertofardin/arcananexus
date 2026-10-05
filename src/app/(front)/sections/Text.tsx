interface IText {
  children: React.ReactNode;
  /** Margini, colore, max-width: tutto ciò che varia da sezione a sezione. */
  className?: string;
}

/** Paragrafo di corpo testo ricorrente: stessa dimensione, interlinea e giustificazione in tutte le sezioni del front (i titoli restano su `font-front`). */
const Text = ({ children, className = "" }: IText) => (
  <p
    className={`text-[clamp(12px,1.2vw,19px)] leading-[1.45] text-justify [text-wrap:pretty] ${className}`.trim()}
  >
    {children}
  </p>
);

export default Text;
