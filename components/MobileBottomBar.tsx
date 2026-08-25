"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/icons/Icon";
import { isCurrent } from "@/lib/navigation";
import { useOpenSignIn } from "@/components/SignInGate";
import { signInHref } from "@/lib/use-signed-in";
import type { SiteBrand } from "@/lib/site-brand-core";

/**
 * The compact bottom bar for phones — Search, Route, Itinerary, Account.
 *
 * Below `sm` the header has no room for the icon row (it is `hidden sm:flex`
 * there), so this is the only way to reach them on the smallest screens.
 * Icon + a one-word label, because a hover tooltip never fires on a phone.
 * No Favorites here — that stays inside Account, per the brief.
 */

const ITEMS: Array<{ key: string; icon: IconName; label: string; href: string }> = [
  { key: "search", icon: "search", label: "Search", href: "/search" },
  { key: "route", icon: "route", label: "Route", href: "/my-route" },
  { key: "itinerary", icon: "suitcase", label: "Itinerary", href: "/itinerary" },
];

export default function MobileBottomBar({ signedIn, brand }: { signedIn: boolean; brand?: SiteBrand }) {
  const pathname = usePathname();
  const openSignIn = useOpenSignIn();
  const items = [
    // The itineraries brand omits Search (the desktop header does too): every
    // result bounces to the kosher domain, so a "search here" door that always
    // leads away is dropped rather than kept.
    ...ITEMS.filter((item) => !(item.key === "search" && brand === "itineraries")),
    {
      key: "account",
      icon: "account" as IconName,
      // The label follows the signed-in state, exactly as the desktop icon row
      // does. It said "Account" in both states, so the bar offered somebody
      // with no account a door to one they did not have.
      label: signedIn ? "Account" : "Sign in",
      href: signedIn ? "/account" : signInHref(),
      // Signed out, the bar opens the sign-in dialog instead of navigating, so
      // somebody reading a destination page stays on it. See useOpenSignIn.
      onPress: signedIn ? undefined : () => openSignIn(),
    },
  ];

  return (
    <nav
      aria-label="Quick links"
      className="fixed inset-x-0 bottom-0 z-[var(--wg-z-header)] flex border-t border-[var(--gold-light)] bg-[#fffdf9] pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgba(23,45,82,.08)] sm:hidden"
    >
      {items.map((item) => {
        const active = isCurrent(item.href, pathname);
        const inner = (
          <>
            <Icon name={item.icon} className={`h-5 w-5 ${active ? "text-[var(--gold-ink)]" : ""}`} />
            {item.label}
          </>
        );
        const shared = `flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-semibold ${
          active ? "text-[var(--navy)]" : "text-stone-500"
        }`;
        // Signed out, Account opens the sign-in dialog rather than navigating,
        // so somebody halfway down a destination page stays on it. A real
        // button, not a link with its navigation cancelled.
        const press = "onPress" in item ? item.onPress : undefined;
        if (press) {
          return (
            <button key={item.key} type="button" onClick={press} className={shared}>
              {inner}
            </button>
          );
        }
        return (
          <Link key={item.key} href={item.href} aria-current={active ? "page" : undefined} className={shared}>
            {inner}
          </Link>
        );
      })}
    </nav>
  );
}
