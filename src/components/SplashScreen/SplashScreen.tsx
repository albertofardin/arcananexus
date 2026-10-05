"use client";
import { useEffect, useState } from "react";
import styles from "./SplashScreen.module.css";
import LogoArcanaDomine from "@/components/LogoArcanaDomine/LogoArcanaDomine";

// Resta a schermo almeno questo tanto anche se il caricamento è istantaneo,
// altrimenti l'animazione lampeggia via prima di essere percepita.
const MIN_DURATION = 1800;
const FADE_DURATION = 500;

const SplashScreen = () => {
  // null finché non sappiamo se siamo nella PWA installata: evita di
  // disegnare lo splash lato server (dove non possiamo saperlo) per poi
  // farlo sparire di scatto in una scheda del browser normale.
  const [isPwa, setIsPwa] = useState<boolean | null>(null);
  const [hidden, setHidden] = useState(false);
  const [mounted, setMounted] = useState(true);

  useEffect(() => {
    setIsPwa(
      window.matchMedia("(display-mode: standalone)").matches ||
        // Safari iOS non espone `display-mode` per le app aggiunte da "Aggiungi a Home".
        (window.navigator as Navigator & { standalone?: boolean })
          .standalone === true
    );
  }, []);

  useEffect(() => {
    if (isPwa !== true) return;
    const start = Date.now();
    const dismiss = () => {
      const wait = Math.max(MIN_DURATION - (Date.now() - start), 0);
      window.setTimeout(() => setHidden(true), wait);
    };
    if (document.readyState === "complete") {
      dismiss();
      return;
    }
    window.addEventListener("load", dismiss, { once: true });
    return () => window.removeEventListener("load", dismiss);
  }, [isPwa]);

  useEffect(() => {
    if (!hidden) return;
    const timeout = window.setTimeout(() => setMounted(false), FADE_DURATION);
    return () => window.clearTimeout(timeout);
  }, [hidden]);

  if (!isPwa || !mounted) return null;

  return (
    <div
      className={styles.overlay}
      data-hidden={hidden}
      aria-hidden={hidden}
      role="presentation"
    >
      <div className={styles.brand}>
        <div className={styles.logoWrap}>
          <LogoArcanaDomine
            color="#fff"
            style={{ width: "100%", height: "auto" }}
          />
        </div>
        <div className={styles.tagline}>
          <span className={styles.diamond} />
          <span>Giochi di Ruolo dal Vivo</span>
          <span className={styles.diamond} />
        </div>
      </div>
    </div>
  );
};

export default SplashScreen;
