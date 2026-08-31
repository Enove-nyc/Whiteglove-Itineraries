"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ClientSummary } from "@/data/clients";
import { EmptyState } from "@/components/ui/EmptyState";

export default function ClientsList() {
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/account/clients", { cache: "no-store" });
        const data = await res.json().catch(() => null);
        if (!active) return;
        if (!res.ok) setError(data?.error || "Could not load your clients.");
        else setClients(Array.isArray(data?.clients) ? data.clients : []);
      } catch {
        if (active) setError("Could not reach the account service.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  if (loading) return <p className="text-sm text-stone-500">Loading…</p>;
  if (error) return <p className="text-sm font-semibold text-red-700">{error}</p>;
  if (clients.length === 0) {
    return (
      <EmptyState
        title="No clients yet"
        description="Once you name a client on a trip's Details in the planner, they show up here."
      />
    );
  }

  return (
    <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
      {clients.map((c) => (
        <li key={c.key}>
          <Link
            href={`/clients/${encodeURIComponent(c.key)}`}
            className="wg-card block border border-[var(--gold-light)] bg-white p-4 transition hover:border-[var(--gold)]"
          >
            <p className="font-semibold text-[var(--navy)]">{c.name}</p>
            <p className="mt-1 text-sm text-stone-600">
              {c.tripCount} {c.tripCount === 1 ? "trip" : "trips"}
              {c.upcomingCount > 0 ? ` · ${c.upcomingCount} upcoming` : ""}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
