"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons/Icon";
import type { AccountPlan } from "@/lib/account-plans";
import { ACCOUNT_PLACES, advisorPlacesFor } from "@/lib/account-places";

/**
 * The four places an account has, one press away.
 *
 * WHAT IT REPLACES. The account icon went straight to /account, which is a
 * page holding four things: itineraries, the route, favorites and the person's
 * own details. Somebody who wanted their trips arrived at their name and
 * address and scrolled. The four are named here instead, and the page they all
 * live on is still one of them.
 *
 * FAVORITES HAS NO PAGE OF ITS OWN and does not want one — it is a section of
 * the account page, deliberately kept off the header icons and the mobile bar.
 * It is reached here by its anchor, which is why these are not all top-level
 * routes.
 *
 * SIGNED OUT THIS DOES NOT EXIST. The icon opens the sign-in dialog instead;
 * a menu of four things none of which can be opened is worse than a door.
 */

export default function AccountMenu({ plan }: { plan?: AccountPlan } = {}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const advisorPlaces = advisorPlacesFor(plan);

  // Closes on a press outside and on Escape. Not a focus trap: this is a menu
  // beside a page, not a dialog over it, and trapping the keyboard in four
  // links would be a worse answer than letting Tab carry on.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent | TouchEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls="account-menu"
        aria-label="Account"
        title="Account"
        className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-[var(--navy)] transition hover:bg-[var(--cream-deep)]"
      >
        <Icon name="account" />
      </button>

      {open ? (
        <div
          id="account-menu"
          role="menu"
          className={`absolute right-0 top-full z-[var(--wg-z-popover)] mt-1 overflow-hidden rounded-xl border border-[var(--gold-light)] bg-[#fcfaf6] py-1 shadow-[0_16px_40px_rgba(23,45,82,.18)] ${advisorPlaces.length > 0 ? "w-56" : "w-48"}`}
        >
          {ACCOUNT_PLACES.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex min-h-11 items-center px-4 text-sm font-semibold text-[var(--navy)] transition hover:bg-white"
            >
              {item.label}
            </Link>
          ))}
          {advisorPlaces.length > 0 && (
            <>
              <p className="mt-1 border-t border-[var(--gold-light)] px-4 pt-2 text-[10px] font-bold uppercase tracking-[0.14em] text-stone-500">
                Advisor tools
              </p>
              {advisorPlaces.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="flex min-h-11 items-center px-4 text-sm font-semibold text-[var(--navy)] transition hover:bg-white"
                >
                  {item.label}
                </Link>
              ))}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
