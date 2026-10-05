/**
 * Logo per l'header dei template email transazionali. Non si può riusare
 * `src/components/LogoArcanaDomine` (SVG inline via React): il supporto a
 * `<img src="*.svg">` è troppo incostante tra client email (Gmail e Outlook
 * desktop in particolare non lo renderizzano). `public/email/logo.png` è un
 * export raster statico dello stesso path (rigenerato con `sharp` solo se il
 * logo sorgente cambia, non ad ogni invio).
 */
export function buildLogoHtml(url: string): string {
  const { origin } = new URL(url);
  return `
    <p style="text-align: center; margin: 0 0 24px;">
      <img
        src="${origin}/email/logo.png"
        alt="Arcana Domine"
        width="200"
        style="width: 200px; max-width: 60%; height: auto;"
      />
    </p>
  `.trim();
}
