"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import styles from "../corporate.module.css";
import { COLORS } from "../tokens";
import { NAV_LINKS } from "../data";
import LoginFromQuery from "../LoginFromQuery";
import LogoArcanaDomine from "@/components/LogoArcanaDomine";
import Icon from "@/components/_core/Icon";
import { LoginAccess } from "@/components/Login";
import { useSession } from "@/lib/auth-client";

// Unica voce di `NAV_LINKS` che invece di uno scroll-to-section apre il
// menu a tendina delle campagne (desktop) o la fisarmonica (mobile) — vedi
// `campaigns` prop, popolata da `Header.tsx` (Server Component).
const CAMPAIGNS_HREF = "/#campagne";

export interface HeaderCampaign {
  name: string;
  slug: string;
  logo: string | null;
}

interface IHeaderNav {
  campaigns: HeaderCampaign[];
}

/**
 * Barra di navigazione fissa che diventa opaca con sfocatura allo scroll,
 * riproducendo la logica `scrolled` del template originale.
 *
 * Da `md` in su i link sono inline; sotto, la navigazione si raccoglie in un
 * pannello a comparsa (hamburger) con righe a tutta larghezza e tap target
 * ampi, così i sei link + la CTA non si accavallano più su schermo stretto.
 *
 * Unico "island" client della home: possiede anche sessione + pannello di
 * login, così il resto della pagina (Hero, sezioni testuali...) può restare
 * Server Component e non finire nel bundle JS del client.
 */
const HeaderNav = ({ campaigns }: IHeaderNav) => {
  const router = useRouter();
  const { data: session } = useSession();
  const [scrolled, setScrolled] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [loginOpen, setLoginOpen] = React.useState(false);
  const [loginRedirectTo, setLoginRedirectTo] = React.useState<string>();
  const [openedFromRedirect, setOpenedFromRedirect] = React.useState(false);
  const [openedFromResetPassword, setOpenedFromResetPassword] =
    React.useState(false);
  const [campaignsMenuOpen, setCampaignsMenuOpen] = React.useState(false);
  const [mobileCampaignsOpen, setMobileCampaignsOpen] = React.useState(false);
  const campaignsMenuRef = React.useRef<HTMLDivElement>(null);

  const hasCampaigns = campaigns.length > 0;
  const accountLabel = "Accedi";

  const onAccount = React.useCallback(() => {
    if (session?.user) {
      router.push("/dashboard");
    } else {
      setLoginOpen(true);
    }
  }, [router, session]);

  const onRedirectLogin = React.useCallback((redirectTo?: string) => {
    setLoginOpen(true);
    setLoginRedirectTo(redirectTo);
    setOpenedFromRedirect(true);
  }, []);

  // T-046: il link email di recupero password riporta qui con
  // `?resetPassword=1&token=...` (aggiunto da Better Auth dopo la verifica)
  // — apre lo stesso pannello di login, senza l'avviso "sessione scaduta"
  // (il form legge `token`/`error` direttamente dalla query string, vedi
  // `FormForgotPassword`).
  const onResetPasswordLogin = React.useCallback(() => {
    setLoginOpen(true);
    setOpenedFromResetPassword(true);
  }, []);

  const onCloseLogin = React.useCallback(() => {
    setLoginOpen(false);
    // Ripulisce `?login=1&redirectTo=...` (o `?resetPassword=1&token=...`)
    // dalla barra degli indirizzi se l'utente chiude il pannello senza
    // completare l'operazione.
    if (openedFromRedirect || openedFromResetPassword) {
      router.replace("/");
      setOpenedFromRedirect(false);
      setOpenedFromResetPassword(false);
    }
  }, [openedFromRedirect, openedFromResetPassword, router]);

  React.useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY || document.documentElement.scrollTop || 0;
      setScrolled(y > 36);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Blocca lo scroll del documento mentre il menu mobile è aperto e consente la
  // chiusura con Esc. Il lock si ripristina alla chiusura/smontaggio.
  React.useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  // Tendina "Campagne" (desktop): chiude al click fuori o con Esc, come il
  // pannello mobile sopra.
  React.useEffect(() => {
    if (!campaignsMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCampaignsMenuOpen(false);
    };
    const onClickOutside = (e: MouseEvent) => {
      if (!campaignsMenuRef.current?.contains(e.target as Node)) {
        setCampaignsMenuOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClickOutside);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClickOutside);
    };
  }, [campaignsMenuOpen]);

  const closeMenu = React.useCallback(() => {
    setMenuOpen(false);
    setMobileCampaignsOpen(false);
  }, []);

  const onAccountClick = React.useCallback(() => {
    setMenuOpen(false);
    onAccount();
  }, [onAccount]);

  // La barra usa lo sfondo solido sia allo scroll sia quando il menu è aperto,
  // così l'icona e il pannello restano leggibili anche partendo dall'hero.
  const solid = scrolled || menuOpen;

  // Il colore del logo (fill SVG) resta una stringa: è passato come prop.
  const navColor = solid ? COLORS.ink2 : "rgba(255,255,255,0.92)";
  const navTextClass = solid ? "text-ad-ink2" : "text-[rgba(255,255,255,0.92)]";

  return (
    <>
      <React.Suspense fallback={null}>
        <LoginFromQuery
          onRedirectLogin={onRedirectLogin}
          onResetPasswordLogin={onResetPasswordLogin}
        />
      </React.Suspense>

      <LoginAccess
        open={loginOpen}
        onClose={onCloseLogin}
        redirectTo={loginRedirectTo}
        notice={
          openedFromRedirect
            ? "La tua sessione è scaduta, per favore accedi di nuovo per continuare"
            : undefined
        }
      />

      <header
        className={[
          "fixed top-0 left-0 right-0 z-[50] flex items-center justify-between gap-4 py-[5px] px-[clamp(14px,4vw,48px)]",
          "border-b transition-[background,backdrop-filter,border-color,box-shadow] duration-300 ease-in-out",
          solid
            ? "bg-[rgba(251,250,247,0.94)] backdrop-blur-[14px] border-ad-border shadow-[0_6px_24px_rgba(20,18,16,0.07)]"
            : "bg-transparent border-transparent shadow-none",
        ].join(" ")}
      >
        <Link
          href="/#top"
          aria-label="Arcana Domine — torna in cima"
          className="flex items-center gap-3"
          onClick={closeMenu}
        >
          {/* Il wordmark compare solo dopo lo scroll (o con il menu aperto, dove
            serve un riferimento visivo): in cima l'Hero mostra già il titolo. */}
          <LogoArcanaDomine
            color={navColor}
            className={`h-[clamp(40px,9vw,50px)] transition-opacity duration-[250ms] ${
              solid ? "opacity-100" : "opacity-0"
            }`}
          />
        </Link>

        {/* ── Navigazione desktop (inline) ── */}
        <nav className="hidden md:flex items-center gap-[clamp(14px,2vw,30px)] justify-end">
          {NAV_LINKS.map(link => {
            if (link.href === CAMPAIGNS_HREF && hasCampaigns) {
              return (
                <div
                  key={link.href}
                  ref={campaignsMenuRef}
                  className="relative"
                >
                  <button
                    type="button"
                    onClick={() => setCampaignsMenuOpen(o => !o)}
                    aria-haspopup="true"
                    aria-expanded={campaignsMenuOpen}
                    className={`${styles.navLink} inline-flex items-center gap-1 text-[14px] font-bold tracking-[0.01em] cursor-pointer ${navTextClass}`}
                  >
                    {link.label}
                    <Icon
                      className={`text-[16px] text-inherit transition-transform duration-200 ${campaignsMenuOpen ? "rotate-180" : ""}`}
                      children="expand_more"
                    />
                  </button>

                  <div
                    role="menu"
                    className={`absolute top-full left-1/2 -translate-x-1/2 pt-3 transition-[opacity,transform] duration-200 ease-out ${
                      campaignsMenuOpen
                        ? "opacity-100 translate-y-0 pointer-events-auto"
                        : "opacity-0 -translate-y-2 pointer-events-none"
                    }`}
                  >
                    <div className="w-64 rounded-xl border border-ad-border bg-white shadow-[0_18px_40px_rgba(20,18,16,0.14)] overflow-hidden py-2">
                      {campaigns.map(c => (
                        <Link
                          key={c.slug}
                          href={`/${c.slug}`}
                          role="menuitem"
                          onClick={() => setCampaignsMenuOpen(false)}
                          className="flex items-center gap-3 px-4 py-2.5 hover:bg-ad-bg-alt transition-colors"
                        >
                          <span className="relative w-8 h-8 rounded-md overflow-hidden bg-ad-dark shrink-0 flex items-center justify-center text-white text-[11px] font-bold">
                            {c.logo ? (
                              <Image
                                src={c.logo}
                                alt=""
                                fill
                                sizes="32px"
                                className="object-contain p-1"
                              />
                            ) : (
                              c.name.charAt(0).toUpperCase()
                            )}
                          </span>
                          <span className="text-[14px] font-bold text-ad-ink2 truncate">
                            {c.name}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
              );
            }

            return link.href.includes("#") ? (
              <a
                key={link.href}
                href={link.href}
                className={`${styles.navLink} text-[14px] font-bold tracking-[0.01em] ${navTextClass}`}
              >
                {link.label}
              </a>
            ) : (
              <a
                key={link.href}
                href={link.href}
                className={`${styles.btnOutlineDark} inline-flex items-center gap-2 border ${solid ? "border-ad-ink2/40" : "border-[rgba(255,255,255,0.5)]"} ${navTextClass} font-bold text-[14px] px-4 py-2 rounded-full tracking-[0.01em]`}
              >
                {link.label}
              </a>
            );
          })}
          <button
            type="button"
            onClick={onAccountClick}
            className={`${styles.btnRed} inline-flex items-center gap-2 bg-ad-red text-white font-bold text-[14px] px-5 py-2.5 border-0 rounded-full tracking-[0.01em] cursor-pointer`}
          >
            {accountLabel}
          </button>
        </nav>

        {/* ── Controlli mobile: CTA compatta + hamburger ── */}
        <div className="flex md:hidden items-center gap-2">
          <button
            type="button"
            onClick={onAccountClick}
            className={`${styles.btnRed} inline-flex items-center bg-ad-red text-white font-bold text-[13px] px-4 py-2 border-0 rounded-full cursor-pointer`}
          >
            {accountLabel}
          </button>
          <button
            type="button"
            aria-label={menuOpen ? "Chiudi il menu" : "Apri il menu"}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            onClick={() => setMenuOpen(o => !o)}
            className={`inline-flex items-center justify-center w-11 h-11 -mr-1 rounded-full cursor-pointer ${navTextClass}`}
          >
            {/* Hamburger ⇄ X, animato. `currentColor` segue navTextClass. */}
            <span
              className="relative block w-[22px] h-[16px]"
              aria-hidden="true"
            >
              <span
                className={`absolute left-0 block h-[2px] w-full rounded bg-current transition-transform duration-300 ${
                  menuOpen ? "top-1/2 -translate-y-1/2 rotate-45" : "top-0"
                }`}
              />
              <span
                className={`absolute left-0 top-1/2 -translate-y-1/2 block h-[2px] w-full rounded bg-current transition-opacity duration-200 ${
                  menuOpen ? "opacity-0" : "opacity-100"
                }`}
              />
              <span
                className={`absolute left-0 block h-[2px] w-full rounded bg-current transition-transform duration-300 ${
                  menuOpen ? "top-1/2 -translate-y-1/2 -rotate-45" : "bottom-0"
                }`}
              />
            </span>
          </button>
        </div>

        {/* ── Pannello di navigazione mobile ── */}
        {/* Backdrop sotto il pannello: chiude al tocco fuori. */}
        <div
          onClick={closeMenu}
          aria-hidden="true"
          className={`md:hidden fixed inset-0 top-[56px] z-[-1] bg-[rgba(20,18,16,0.28)] transition-opacity duration-300 ${
            menuOpen ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
        />
        <nav
          id="mobile-nav"
          aria-label="Navigazione principale"
          className={`md:hidden absolute top-full left-0 right-0 origin-top bg-ad-bg border-b border-ad-border shadow-[0_18px_40px_rgba(20,18,16,0.12)] transition-[opacity,transform] duration-300 ease-out max-h-[calc(100dvh-56px)] overflow-y-auto ${
            menuOpen
              ? "opacity-100 translate-y-0 pointer-events-auto"
              : "opacity-0 -translate-y-3 pointer-events-none"
          }`}
        >
          <ul className="flex flex-col py-2 px-[clamp(14px,4vw,48px)]">
            {NAV_LINKS.map(link => {
              if (link.href === CAMPAIGNS_HREF && hasCampaigns) {
                return (
                  <li key={link.href} className="border-b border-ad-border">
                    <button
                      type="button"
                      onClick={() => setMobileCampaignsOpen(o => !o)}
                      aria-expanded={mobileCampaignsOpen}
                      aria-controls="mobile-campaigns"
                      className="flex items-center justify-between w-full min-h-[52px] text-[16px] font-bold tracking-[0.01em] text-ad-ink2 cursor-pointer"
                    >
                      {link.label}
                      <Icon
                        className={`text-[20px] text-inherit transition-transform duration-200 ${mobileCampaignsOpen ? "rotate-180" : ""}`}
                        children="expand_more"
                      />
                    </button>
                    <ul
                      id="mobile-campaigns"
                      className={`overflow-hidden transition-[max-height] duration-300 ease-in-out ${
                        mobileCampaignsOpen ? "max-h-[70vh]" : "max-h-0"
                      }`}
                    >
                      {campaigns.map(c => (
                        <li key={c.slug}>
                          <Link
                            href={`/${c.slug}`}
                            onClick={closeMenu}
                            className="flex items-center gap-3 min-h-[48px] pl-2 text-[15px] font-bold text-ad-muted active:text-ad-red"
                          >
                            <span className="relative w-6 h-6 rounded overflow-hidden bg-ad-dark shrink-0 flex items-center justify-center text-white text-[10px] font-bold">
                              {c.logo ? (
                                <Image
                                  src={c.logo}
                                  alt=""
                                  fill
                                  sizes="24px"
                                  className="object-contain p-0.5"
                                />
                              ) : (
                                c.name.charAt(0).toUpperCase()
                              )}
                            </span>
                            {c.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              }

              return (
                <li
                  key={link.href}
                  className="border-b border-ad-border last:border-0"
                >
                  <a
                    href={link.href}
                    onClick={closeMenu}
                    className={`flex items-center min-h-[52px] text-[16px] font-bold tracking-[0.01em] active:text-ad-red ${
                      link.href.includes("#") ? "text-ad-ink2" : "text-ad-red"
                    }`}
                  >
                    {link.label}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>
    </>
  );
};

export default HeaderNav;
