"use client";

import * as React from "react";
import styles from "./corporate.module.css";

interface IReveal {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Rivela il contenuto con una dissolvenza quando entra nel viewport.
 *
 * Sostituisce l'`IntersectionObserver` che nel template originale animava gli
 * elementi `[data-reveal]`: osserva una sola volta e poi smette.
 */
const Reveal = ({ children, className, style }: IReveal) => {
  const ref = React.useRef<HTMLDivElement>(null);
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      entries => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            setVisible(true);
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -6% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={[
        styles.reveal,
        visible ? styles.revealVisible : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={style}
    >
      {children}
    </div>
  );
};

export default Reveal;
