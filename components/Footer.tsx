"use client";

import Image from "next/image";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { brandForHost, configuredBrand } from "@/lib/site-brand-core";

/**
 * The bottom of every page — kept extremely small at the owner's word.
 *
 * Contact, Advertise, Terms, Privacy. Nothing else. Every page that
 * used to be reachable only through the four-column footer this replaces now
 * has a real home in the header's five dropdowns (lib/navigation.ts) or a
 * direct link from the page it's most relevant to.
 *
 * BRAND-AWARE, like the header. On whitegloveitineraries.com it names itself
 * "Itineraries" and drops the two kosher-leaning links (Advertise, Sources) —
 * that domain is the trip-planning product, not the kosher travel guide. The
 * brand is settled from the hostname after mount, the same way Navbar does it,
 * so the kosher site's static pages stay static (default is kosher; a server
 * read of the host would turn every page dynamic).
 *
 * ADMIN IS NOT HERE. It has been in and out twice; it rests out. The owner
 * reaches the admin at its own subdomain, and a link to it on three hundred
 * customer pages is furniture for one person put in front of everybody else.
 */
const KOSHER_LINKS = [
  { label: "Contact", href: "/contact" },
  { label: "Advertise", href: "/contact?reason=advertise" },
  { label: "Sources", href: "/sources" },
  { label: "Terms", href: "/terms" },
  { label: "Privacy", href: "/privacy" },
];

// The itineraries site is the planner; Advertise and Sources belong to the
// kosher guide, so its footer carries only the three everyone needs.
const ITINERARIES_LINKS = [
  // What it costs, said where somebody looks for it. The page existed only in
  // the other repository until now, so this site answered a visitor asking the
  // most ordinary question about a paid product with a 404.
  { label: "Pricing", href: "/pricing" },
  { label: "Contact", href: "/contact" },
  { label: "Terms", href: "/terms" },
  { label: "Privacy", href: "/privacy" },
];

/** The hostname never changes, so subscribing is a no-op. */
const NO_CHANGE = () => () => {};

// Footer links that are marketing, not support/legal — dropped in the app's
// minimal footer so a sealed app surface has no tap-path out to the sales side.
const FOOTER_MARKETING = new Set(["Pricing", "Advertise", "Sources"]);

export default function Footer({ brand: brandProp, minimal = false }: { brand?: "kosher" | "itineraries"; minimal?: boolean } = {}) {
  /**
   * The same three answers as the navigation, in the same order: what the page
   * passed, what this deployment was BUILT as, then the hostname.
   *
   * The footer settled from the hostname after mount too, so it signed itself
   * "White Glove Kosher Travel" for a frame on this site — and in the HTML,
   * for anything that never runs the correction. Read through
   * useSyncExternalStore rather than an effect, which is the primitive for
   * exactly this and clears the standing set-state-in-effect violation this
   * file carried.
   */
  const built = configuredBrand();
  const fromHost = useSyncExternalStore(
    NO_CHANGE,
    () => brandForHost(window.location.hostname),
    () => built ?? "kosher",
  );
  const isItineraries = (brandProp ?? built ?? fromHost) === "itineraries";
  const allLinks = isItineraries ? ITINERARIES_LINKS : KOSHER_LINKS;
  // Inside the app, keep only support/legal (Contact, Terms, Privacy) — no
  // Pricing or other marketing. Contact/Terms/Privacy belong in an app.
  const links = minimal ? allLinks.filter((link) => !FOOTER_MARKETING.has(link.label)) : allLinks;

  return (
    <footer id="contact" className="border-t border-[var(--gold-light)] bg-[var(--navy-deep)] text-[#f7f3eb]">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        {/* THE MARK, AND THE NAME AS TEXT — the same lockup as the header. */}
        <div className="flex items-center gap-3">
          <Image
            src="/logo-hand-navy.png"
            alt=""
            width={355}
            height={460}
            className="h-12 w-auto object-contain brightness-0 invert"
          />
          <span className="flex flex-col leading-none">
            <span className="font-[family-name:var(--font-display)] text-xl text-[#f7f3eb]">White Glove</span>
            {/* --gold-light, not --gold: on the navy sections that is the text
                accent, and --gold is a border colour that does not clear 4.5:1
                as words. See the note in globals.css. */}
            <span className="mt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--gold-light)]">{isItineraries ? "Itineraries" : "Kosher Travel"}</span>
          </span>
        </div>

        <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-6 gap-y-3">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="inline-flex min-h-11 items-center text-sm font-semibold text-slate-300 transition hover:text-white">
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto max-w-7xl px-5 py-4 sm:px-8">
          <p className="text-xs text-slate-400">© White Glove {isItineraries ? "Itineraries" : "Kosher Travel"}</p>
        </div>
      </div>
    </footer>
  );
}
