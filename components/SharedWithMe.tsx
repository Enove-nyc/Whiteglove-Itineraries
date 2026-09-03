"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type SharedTrip = { ownerEmail: string; ownerName?: string; title: string; shareId: string };

// Trips other people have added the signed-in traveler to. Renders nothing when
// there are none (or when not logged in), so it's safe to always mount.
export default function SharedWithMe() {
  const [trips, setTrips] = useState<SharedTrip[]>([]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/account/shared-with-me", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (active) setTrips(data.trips ?? []);
      } catch {
        /* ignore */
      }
    })();
    return () => { active = false; };
  }, []);

  if (trips.length === 0) return null;

  return (
    <div className="wg-card mb-6 border border-[var(--gold-light)] bg-[#FAF8F3] p-6">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--gold-ink)]">Shared with you</p>
      <ul className="mt-3 divide-y divide-[var(--gold-light)]">
        {trips.map((t) => (
          <li key={t.shareId} className="flex items-center justify-between gap-4 py-2">
            <span className="min-w-0">
              <span className="font-semibold text-[var(--navy)]">{t.title}</span>
              <span className="block text-xs text-stone-500">from {t.ownerName || t.ownerEmail}</span>
            </span>
            <Link href={`/i/${t.shareId}`} className="shrink-0 border border-[var(--gold)] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--navy)] transition hover:bg-[var(--navy)] hover:text-white">View →</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
