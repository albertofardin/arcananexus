import styles from "./corporate.module.css";
import Header from "./sections/Header";
import Hero from "./sections/Hero";
import AboutGrv from "./sections/AboutGrv";
import AboutUs from "./sections/AboutUs";
import Campaigns from "./sections/Campaigns";
import HowToStart from "./sections/HowToStart";
import Events from "./sections/Events";
import Support from "./sections/Support";
import SiteFooter from "./sections/SiteFooter";

/**
 * Landing pubblica di Arcana Domine APS.
 *
 * `Header` e `Campaigns` leggono le campagne da Prisma: senza `revalidate`
 * Next non rileva alcuna API dinamica (niente `fetch`/`cookies`/`headers`) e
 * prerenderizza la pagina una sola volta in build, congelando l'elenco —
 * una campagna resa visibile dopo il deploy non comparirebbe mai finché non
 * si ricostruisce il sito. Un minuto di ISR la mantiene comunque
 * cacheabile in edge senza ricalcolarla ad ogni richiesta.
 */
export const revalidate = 60;

const Page = () => (
  <div id="top" className={styles.root}>
    <Header />

    <main>
      <Hero />
      <AboutGrv />
      <AboutUs />
      <HowToStart />
      <Events />
      <Campaigns />
      <Support />
    </main>

    <SiteFooter />
  </div>
);

export default Page;
