"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import DestinationSearch from "@/components/DestinationSearch";
import SitePromotions from "@/components/SitePromotions";
import MobileBottomBar from "@/components/MobileBottomBar";
import { Icon } from "@/components/icons/Icon";
import { IconLink } from "@/components/icons/IconAction";
import { categoriesForBrand, categoryIsCurrent, isCurrent, itinerariesBookingCategoryFor, SIGN_IN, travelCategoryFor, type NavCategory } from "@/lib/navigation";
import { brandForHost, configuredBrand } from "@/lib/site-brand-core";
import AccountMenu, { ACCOUNT_PLACES, advisorPlacesFor } from "@/components/AccountMenu";
import type { AccountPlan } from "@/lib/account-plans";
import { useOpenSignIn } from "@/components/SignInGate";
import { signInHref, useViewer } from "@/lib/use-signed-in";
import { useBookingLink } from "@/components/BookingLinkProvider";

/**
 * The header: logo, four dropdown categories, four utility icons.
 *
 * What each dropdown holds is in lib/navigation.ts, not here. A dropdown is
 * opened by a press — mouse, touch, Enter or Space — never by hovering or
 * focusing onto it; hovering only slides between menus once one is already
 * open. Escape closes and returns focus to its trigger, a press outside
 * closes, and only one is open at a time. See the note above the handlers for
 * why opening on hover made the buttons look dead.
 *
 * MINIMAL DROPS THE FOUR CATEGORIES. An advisor working the trip pipeline or
 * building a proposal saw the exact same Destinations/Travel/Kosher/Book bar
 * a first-time visitor sees — the header gave no sign this was a business
 * tool rather than the public site. The six advisor-tool pages pass
 * `minimal`, which leaves the logo, the account menu (with its own advisor
 * tools) and sign-out in place and drops only the four public categories.
 */

/** The hostname never changes, so subscribing is a no-op. */
const NO_CHANGE = () => () => {};

export default function Navbar({ brand: brandProp, minimal = false, homeHref }: { brand?: "kosher" | "itineraries"; minimal?: boolean; homeHref?: string } = {}) {
  /**
   * WHICH BRAND THIS IS, DECIDED AS EARLY AS IT CAN BE.
   *
   * Three answers in order, and the order is the point:
   *
   *   1. What the page passed. A page that resolved the brand on the server
   *      knows better than anything here.
   *   2. What this deployment was BUILT as — NEXT_PUBLIC_SITE_BRAND. This
   *      service answers one domain, so it can be told once and be right in
   *      the markup it sends.
   *   3. The hostname, in the browser.
   *
   * It used to be (3) alone, corrected after mount: a visitor here was served
   * White Glove Kosher Travel and shown it change, and anything reading the
   * HTML never saw it change at all. Setting the variable removes the
   * correction; leaving it unset leaves the old behaviour exactly as it was.
   *
   * Read through useSyncExternalStore rather than an effect — the primitive
   * for exactly this, letting the server and the browser disagree honestly
   * instead of rendering and then setting state on itself.
   */
  const built = configuredBrand();
  const fromHost = useSyncExternalStore(
    NO_CHANGE,
    () => brandForHost(window.location.hostname),
    () => built ?? "kosher",
  );
  const brand = brandProp ?? built ?? fromHost;
  const isItineraries = brand === "itineraries";
  // Where the logo goes. On the marketing site it is the home page. Inside the
  // itineraries app (minimal chrome) the home page is a marketing page the app
  // must not reach, so the logo points back into the app instead — /app by
  // default, or whatever home the page passes (an advisor page passes
  // /advisor). Kosher's app is the whole site, so its logo stays the home page
  // even in minimal chrome. The app has no address bar, so a logo that never
  // links out to marketing is what keeps marketing unreachable.
  const logoHref = homeHref ?? (minimal && isItineraries ? "/app" : "/");
  const openSignIn = useOpenSignIn();
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => {
    if (!searchOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSearchOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [searchOpen]);
  const pathname = usePathname();
  const router = useRouter();
  /**
   * WHICH MENU IS OPEN, AND WHICH ONE A PRESS OPENED.
   *
   * Both together, in one piece of state, because every rule below decides
   * from the pair and two separate values cannot be updated from each other
   * without going stale — which is the exact fault this header has had twice.
   *
   * `pressed` is why the second fix was needed. Hover-switching reintroduced
   * the original bug one level down: with Destinations open, moving the
   * pointer onto Travel opened Travel (correct), and then the click on Travel
   * saw "Travel is open" and shut it, so clicking a second menu closed the
   * whole bar instead of switching to it. Hover moves `open` and never
   * touches `pressed`; only a press writes it. A click on a menu the pointer
   * merely slid onto therefore opens it for real, and a click on the menu a
   * press opened closes it — which is what a toggle means.
   */
  const [menu, setMenu] = useState<{ open: string | null; pressed: string | null }>({ open: null, pressed: null });
  const openKey = menu.open;
  const closeAll = () => setMenu({ open: null, pressed: null });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileSection, setMobileSection] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [plan, setPlan] = useState<AccountPlan | undefined>(undefined);
  // Closing every dropdown on navigation is a reset triggered by a changed
  // prop (the route), not a side effect — done during render, per React's own
  // guidance, rather than in a useEffect that would cause an extra render.
  const [trackedPathname, setTrackedPathname] = useState(pathname);
  if (trackedPathname !== pathname) {
    setTrackedPathname(pathname);
    setMenu({ open: null, pressed: null });
    setMobileOpen(false);
    setMobileSection(null);
    // The search bar closes with them: following a result is the end of that
    // search, and leaving the bar open over the page somebody just arrived at
    // would cover the top of it.
    setSearchOpen(false);
  }
  const [scrolled, setScrolled] = useState(false);
  // On a paid tier, the hand in the logo is gold. Read from the same viewer the
  // sign-in control uses; undefined until it resolves, so the hand starts navy.
  const viewer = useViewer();
  const paid = Boolean(viewer?.paid);
  const navRef = useRef<HTMLElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Search & Book's three links resolve through booking-access — locked, they
  // go to the public assistance page instead of a password box. See
  // lib/booking-access.ts and lib/navigation.ts's bookCategoryFor.
  const booking = useBookingLink();
  // Four categories; Travel's booking links resolve through the owner's lock.
  // Minimal drops them entirely — see the note above the component.
  const categories: NavCategory[] = minimal
    ? []
    : categoriesForBrand(brand).map((category) =>
        isItineraries
          ? category.label === "Book"
            ? itinerariesBookingCategoryFor(booking)
            : category
          : category.label === "Travel"
            ? travelCategoryFor(booking)
            : category,
      );

  useEffect(() => {
    let active = true;
    fetch("/api/account/me", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (!active) return;
        setSignedIn(Boolean(data?.signedIn));
        setPlan(data?.plan);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [pathname]);

  // Reserves room at the bottom of the page for the fixed mobile bar, below
  // `sm` only (see the matching rule in globals.css). Scoped to a body class
  // set only while Navbar is mounted, so /admin — which never renders this
  // component — is never affected.
  useEffect(() => {
    document.body.classList.add("wg-has-mobile-bar");
    return () => document.body.classList.remove("wg-has-mobile-bar");
  }, []);

  // The header becomes slightly smaller once the page has moved under it —
  // a small cue that it's the same bar, not a different one.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const closeOutside = (event: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(event.target as Node)) {
        setMenu({ open: null, pressed: null });
      }
    };
    document.addEventListener("mousedown", closeOutside);
    return () => document.removeEventListener("mousedown", closeOutside);
  }, []);

  useEffect(() => {
    if (!openKey) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const key = openKey;
      setMenu({ open: null, pressed: null });
      if (key) triggerRefs.current[key]?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openKey]);

  /**
   * HOVER OPENS THE MENU — and why that no longer breaks the buttons.
   *
   * This used to open on hover and toggle on click, and the two fought:
   * moving a mouse to a trigger hovered it open, then the click read "it is
   * open" and shut it again, so the panel flickered and the button looked
   * dead. Hover-open was removed to stop that. The owner wants it back, and it
   * is safe now because of the split kept from that fix:
   *
   *   - Hover sets only `open`. It never sets `pressed`.
   *   - Click toggles on `pressed`, from the LIVE state via the functional
   *     updater. After hover has opened a menu, `pressed` is still null, so
   *     the first click commits the press and LEAVES IT OPEN rather than
   *     closing it. A second click, now that `pressed` matches, closes it.
   *
   * So hovering opens, clicking never closes what hover opened, and the panel
   * cannot flicker under the pointer. On touch there is no hover, so the tap
   * is the open and the second tap the close — unchanged.
   *
   * Focus still does not open: tab to a trigger, then Enter or Space, which a
   * <button> turns into a click. The 150ms leave-timer and the outside-click
   * and Escape handlers close it.
   */
  function openOnHover(key: string) {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    // Open (or slide to) this menu. `pressed` is left alone: hovering is not a
    // press, which is exactly what keeps the next click from reading as close.
    setMenu((current) => (current.open === key ? current : { ...current, open: key }));
  }

  function stayOpen() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }

  function toggleOnClick(key: string) {
    setMenu((current) =>
      current.pressed === key ? { open: null, pressed: null } : { open: key, pressed: key },
    );
  }

  function closeOnHoverOut() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(closeAll, 150);
  }

  async function signOut() {
    await fetch("/api/account/logout", { method: "POST" }).catch(() => undefined);
    setSignedIn(false);
    router.push("/");
    router.refresh();
  }

  return (
    <>
      <nav
        ref={navRef}
        aria-label="Main"
        className={`relative sticky top-0 z-[var(--wg-z-header)] border-b border-[var(--gold-light)] bg-[rgba(252,250,246,0.97)] shadow-[0_1px_12px_rgba(23,45,82,.05)] backdrop-blur-md transition-[min-height] ${
          scrolled ? "min-h-16" : "min-h-20"
        }`}
      >
        <div className={`mx-auto flex max-w-7xl items-center gap-2 px-5 transition-[min-height] sm:px-8 ${scrolled ? "min-h-16" : "min-h-20"}`}>
          <Link href={logoHref} className="relative z-10 mr-2 flex shrink-0 items-center gap-2.5 sm:mr-4" aria-label={isItineraries ? "White Glove Itineraries home" : "White Glove Kosher Travel home"}>
            {/* The hand, drawn from the logo's alpha so its colour is CSS: navy
                for everyone, gold for a paid member (see .header-glove). */}
            <span
              aria-hidden="true"
              className={`header-glove transition-[height] ${scrolled ? "h-8" : "h-9 sm:h-11"} ${paid ? "is-gold" : ""}`}
            />
            {/* Shown from 360px: a 390px phone is the common case, and hiding
                the site's own name there left the header as a bare mark. */}
            <span className="hidden flex-col leading-none min-[360px]:flex">
              <span className="font-[family-name:var(--font-display)] text-lg text-[var(--navy)]">White Glove</span>
              <span className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--gold-ink)]">{isItineraries ? "Itineraries" : "Kosher Travel"}</span>
            </span>
          </Link>

          {/* The four dropdowns. Hidden below lg (~1024px), where the hamburger
              carries the same categories as an accordion. */}
          <div className="hidden min-w-0 flex-1 items-center gap-0.5 lg:flex">
            {categories.map((category) => {
              const key = category.label;
              const current = categoryIsCurrent(category, pathname);
              const open = openKey === key;
              return (
                <div
                  key={key}
                  className="relative"
                  onMouseEnter={() => openOnHover(key)}
                  onMouseLeave={closeOnHoverOut}
                  onBlur={(event) => {
                    // Focus moved outside this category: close its panel, so a
                    // keyboard user tabbing on never leaves a menu floating.
                    if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                      setMenu((current) => (current.open === key ? { open: null, pressed: null } : current));
                    }
                  }}
                >
                  <button
                    ref={(el) => {
                      triggerRefs.current[key] = el;
                    }}
                    type="button"
                    aria-expanded={open}
                    aria-haspopup="true"
                    aria-controls={`nav-${key}`}
                    onClick={() => toggleOnClick(key)}
                    className={`relative inline-flex min-h-11 items-center gap-1 whitespace-nowrap rounded-full px-3 py-2 text-sm font-semibold transition ${
                      current || open
                        ? "bg-[var(--cream-deep)] text-[var(--navy)] after:absolute after:inset-x-3 after:bottom-1 after:h-0.5 after:rounded-full after:bg-[var(--gold)] after:content-['']"
                        : "text-stone-600 hover:bg-[var(--cream-deep)] hover:text-[var(--navy)]"
                    }`}
                  >
                    {category.label}
                    <Icon name="chevron-down" className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
                  </button>
                  {open && (
                    <div
                      id={`nav-${key}`}
                      role="menu"
                      onMouseEnter={stayOpen}
                      onMouseLeave={closeOnHoverOut}
                      className={`absolute left-0 top-full z-20 mt-1 rounded-xl border border-[var(--gold-light)] bg-[#fffdf9] shadow-[0_18px_40px_rgba(23,45,82,.15)] ${
                        category.groups ? "grid w-[26rem] grid-cols-2 gap-x-6 p-4" : "min-w-48 py-2"
                      }`}
                    >
                      {category.groups
                        ? category.groups.map((group) => (
                            <div key={group.title}>
                              <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--gold-ink)]">{group.title}</p>
                              {group.links.map((link) => {
                                const linkCurrent = isCurrent(link.href, pathname);
                                return (
                                  <Link
                                    key={link.href + link.label}
                                    role="menuitem"
                                    href={link.href}
                                    aria-current={linkCurrent ? "page" : undefined}
                                    onClick={closeAll}
                                    className={`flex min-h-11 items-center rounded-md px-2 py-2 text-sm transition ${
                                      linkCurrent ? "font-semibold text-[var(--navy)]" : "text-stone-600 hover:bg-[var(--cream-deep)] hover:text-[var(--navy)]"
                                    }`}
                                  >
                                    {link.label}
                                  </Link>
                                );
                              })}
                            </div>
                          ))
                        : category.links.map((link) => {
                        const linkCurrent = isCurrent(link.href, pathname);
                        return (
                          <Link
                            key={link.href + link.label}
                            role="menuitem"
                            href={link.href}
                            aria-current={linkCurrent ? "page" : undefined}
                            aria-label={link.description}
                            title={link.description}
                            onClick={closeAll}
                            className={`flex min-h-11 items-center px-4 py-2 text-sm transition ${
                              linkCurrent ? "font-semibold text-[var(--navy)]" : "text-stone-600 hover:bg-[var(--cream-deep)] hover:text-[var(--navy)]"
                            }`}
                          >
                            {link.label}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-1">
            <div className="hidden items-center gap-1 sm:flex">
              {/* A BAR ACROSS THIS PAGE, NOT A PAGE OF ITS OWN. Searching used
                  to mean leaving whatever somebody was reading; the results
                  drop down over the page and Escape gives it straight back.
                  /search is still a real page for a typed URL, a bookmark, or
                  pressing Enter on a query worth its own screen.
                  NOT ON ITINERARIES. It doesn't host a single destination
                  page — every result would hand the visitor straight to the
                  kosher site, so the box that promises to search here is
                  dropped rather than kept as a door that always leads away. */}
              {!isItineraries && (
                <IconLink
                  icon="search"
                  label="Search"
                  href="/search"
                  onClick={() => setSearchOpen((v) => !v)}
                />
              )}
              <IconLink icon="route" label="Route" href="/my-route" />
              <IconLink icon="suitcase" label="Itinerary" href="/itinerary" />
              {/* Signed in, the icon opens the four places an account has —
                  /account is a page holding all four, and somebody who wanted
                  their trips used to land on their own name and scroll. Signed
                  out it opens the sign-in dialog instead of leaving the page. */}
              {signedIn ? (
                <AccountMenu plan={plan} />
              ) : (
                <IconLink icon="account" label="Sign in" href={signInHref()} onClick={() => openSignIn()} />
              )}
            </div>

            {/* xl and up: the bar above is the navigation. Below xl: this is
                the navigation, and it opens the same five categories plus
                account, as an accordion, by tap. */}
            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              aria-expanded={mobileOpen}
              aria-controls="mobile-menu"
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-md border border-[var(--gold-light)] text-[var(--navy)] transition hover:border-[var(--gold)] hover:bg-[var(--cream-deep)] lg:hidden"
            >
              <Icon name={mobileOpen ? "close" : "menu"} className="h-5 w-5" />
            </button>
          </div>
        </div>

        {searchOpen && (
          // BELOW THE DROPDOWNS, SAID OUT LOUD. This bar renders after the nav
          // row and paints its own solid background across the full width —
          // exactly where an open menu hangs down. With neither given a
          // position in the stack it came down to paint order, and the bar won:
          // opening the search hid whichever menu was open behind it. The
          // header is one stacking context, so two explicit numbers settle it
          // for good rather than leaving it to the order things happen to be
          // written in.
          <div className="relative z-0 border-t border-[var(--gold-light)] bg-[#fcfaf6]">
            <div className="mx-auto flex max-w-7xl items-center gap-2 px-5 py-3 sm:px-8">
              <div className="min-w-0 flex-1">
                <DestinationSearch compact autoFocus id="header-search" />
              </div>
              <button
                type="button"
                onClick={() => setSearchOpen(false)}
                aria-label="Close search"
                className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md text-stone-500 transition hover:bg-white hover:text-[var(--navy)]"
              >
                <Icon name="close" className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {mobileOpen && (
          <div id="mobile-menu" className="absolute left-0 right-0 top-full z-20 max-h-[calc(100vh-4rem)] w-full overflow-y-auto border-b border-[var(--gold-light)] bg-[#fffdf9] shadow-[0_18px_40px_rgba(23,45,82,.15)] lg:hidden">
            <ul className="divide-y divide-[var(--gold-light)]/60 px-5 sm:px-8">
              {categories.map((category) => {
                const key = category.label;
                const expanded = mobileSection === key;
                return (
                  <li key={key}>
                    <button
                      type="button"
                      aria-expanded={expanded}
                      aria-controls={`mobile-${key}`}
                      onClick={() => setMobileSection(expanded ? null : key)}
                      className="flex min-h-12 w-full items-center justify-between py-3 text-left text-base font-semibold text-[var(--navy)]"
                    >
                      {category.label}
                      <Icon name="chevron-down" className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
                    </button>
                    {expanded && (
                      <ul id={`mobile-${key}`} className="pb-2">
                        {category.links.map((link) => (
                          <li key={link.href + link.label}>
                            <Link href={link.href} onClick={() => setMobileOpen(false)} className="flex min-h-11 items-center rounded-md px-3 py-2 text-sm text-stone-600 hover:bg-[var(--cream-deep)] hover:text-[var(--navy)]">
                              {link.label}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="flex items-center justify-between gap-3 border-t border-[var(--gold-light)] px-5 py-4 sm:px-8">
              {signedIn ? (
                <div className="flex w-full flex-col gap-3">
                  {/* The same places the header icon offers. Named here too,
                      because this menu is the navigation below xl and one
                      "Account" link hides them. */}
                  <div className="flex flex-wrap items-center gap-2">
                    {[...ACCOUNT_PLACES, ...advisorPlacesFor(plan)].map((place) => (
                      <Link
                        key={place.href}
                        onClick={() => setMobileOpen(false)}
                        href={place.href}
                        className="rounded-md border border-[var(--gold-light)] px-4 py-2 text-sm font-semibold text-[var(--navy)] hover:bg-[var(--cream-deep)]"
                      >
                        {place.label}
                      </Link>
                    ))}
                  </div>
                  <button type="button" onClick={() => { setMobileOpen(false); signOut(); }} className="self-start text-sm font-semibold text-stone-600 hover:text-[var(--navy)]">
                    Sign out
                  </button>
                </div>
              ) : (
                <Link onClick={() => setMobileOpen(false)} href={signInHref()} className="rounded-md border border-[var(--gold-light)] px-4 py-2 text-sm font-semibold text-[var(--navy)] hover:bg-[var(--cream-deep)]">
                  {SIGN_IN.label}
                </Link>
              )}
            </div>
          </div>
        )}
      </nav>
      <SitePromotions />
      <MobileBottomBar signedIn={signedIn} brand={brand} />
    </>
  );
}
