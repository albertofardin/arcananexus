import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Arcana Domine APS — Gioco di Ruolo dal Vivo nel Triveneto",
  description:
    "Associazione di Promozione Sociale dedicata al Gioco di Ruolo dal Vivo (GRV/LARP) nel Triveneto. Attiva dal 2004, sei campagne da esplorare.",
};

export default function FrontLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      {/*
        La landing pubblica usa lo scroll del documento (l'header legge
        `window.scrollY`). `globals.css` però blocca `html, body` con
        `overflow:hidden; height:100%` per l'app-shell della dashboard, che
        scrolla in container interni. Qui sblocchiamo l'overflow: lo <style>
        vive quanto questo layout, quindi navigando verso la dashboard il
        lock si ripristina da solo. Reso lato server: nessun flash.
      */}
      <style>{`html,body{overflow:auto!important;height:auto!important}`}</style>
      {children}
    </>
  );
}
