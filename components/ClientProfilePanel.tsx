"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ClientProfile } from "@/data/clients";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

type TripRow = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  shareId?: string;
};

export default function ClientProfilePanel({ clientKey }: { clientKey: string }) {
  const router = useRouter();
  const [trips, setTrips] = useState<TripRow[]>([]);
  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const [notes, setNotes] = useState("");
  const [preferences, setPreferences] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/account/clients/${encodeURIComponent(clientKey)}`, { cache: "no-store" });
        const data = await res.json().catch(() => null);
        if (!active) return;
        if (!res.ok) {
          setError(data?.error || "Could not load this client.");
          return;
        }
        setTrips(Array.isArray(data.trips) ? data.trips : []);
        setProfile(data.profile ?? null);
        setNotes(data.profile?.notes ?? "");
        setPreferences(data.profile?.preferences ?? "");
      } catch {
        if (active) setError("Could not reach the account service.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [clientKey]);

  async function save() {
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const res = await fetch(`/api/account/clients/${encodeURIComponent(clientKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes, preferences }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setError(data?.error || "Could not save that.");
        return;
      }
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  async function openTrip(id: string, path: string) {
    setSwitching(id);
    try {
      await fetch("/api/account/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "switch", id }),
      });
      router.push(path);
    } finally {
      setSwitching(null);
    }
  }

  if (loading) return <p className="text-sm text-stone-500">Loading…</p>;
  if (error && trips.length === 0) return <p className="text-sm font-semibold text-red-700">{error}</p>;

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = trips.filter((t) => !t.endDate || t.endDate >= today);
  const previous = trips.filter((t) => t.endDate && t.endDate < today);

  return (
    <div className="grid gap-8 lg:grid-cols-3">
      <div className="lg:col-span-2 flex flex-col gap-8">
        <section>
          <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">Upcoming trip{upcoming.length === 1 ? "" : "s"}</h2>
          {upcoming.length === 0 ? (
            <div className="mt-3">
              <EmptyState title="Nothing upcoming" description="Every trip for this client has already happened." />
            </div>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {upcoming.map((t) => (
                <li key={t.id} className="wg-card flex items-center justify-between gap-3 border border-[var(--gold-light)] bg-white p-4">
                  <div>
                    <p className="font-semibold text-[var(--navy)]">{t.name}</p>
                    <p className="text-sm text-stone-500">{t.startDate} {t.endDate ? `→ ${t.endDate}` : ""}</p>
                  </div>
                  <Button size="sm" onClick={() => void openTrip(t.id, "/itinerary")} disabled={switching === t.id}>
                    {switching === t.id ? "Opening…" : "Open"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">Previous trips</h2>
          {previous.length === 0 ? (
            <p className="mt-3 text-sm text-stone-500">No past trips yet.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {previous.map((t) => (
                <li key={t.id} className="wg-card flex items-center justify-between gap-3 border border-[var(--gold-light)] bg-[#FAF8F3] p-4">
                  <div>
                    <p className="font-semibold text-[var(--navy)]">{t.name}</p>
                    <p className="text-sm text-stone-500">{t.startDate} {t.endDate ? `→ ${t.endDate}` : ""}</p>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => void openTrip(t.id, "/itinerary")} disabled={switching === t.id}>
                    {switching === t.id ? "Opening…" : "Open"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="wg-card border border-[var(--gold-light)] bg-white p-5">
        <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">Preferences &amp; notes</h2>
        <p className="mt-1 text-sm text-stone-600">Kept about this client, across every trip — not tied to any one of them.</p>
        <label className="mt-4 block">
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500">Preferences</span>
          <textarea
            value={preferences}
            onChange={(e) => setPreferences(e.target.value)}
            rows={3}
            placeholder="Aisle seats, no shellfish, prefers early check-in…"
            className="mt-1.5 w-full rounded-md border border-[var(--gold-light)] bg-white px-3 py-2.5 text-sm text-[var(--navy)] focus:border-[var(--gold)] focus:outline-none focus:ring-2 focus:ring-[var(--gold-light)]"
          />
        </label>
        <label className="mt-4 block">
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500">Notes</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            placeholder="Anything worth remembering about this client…"
            className="mt-1.5 w-full rounded-md border border-[var(--gold-light)] bg-white px-3 py-2.5 text-sm text-[var(--navy)] focus:border-[var(--gold)] focus:outline-none focus:ring-2 focus:ring-[var(--gold-light)]"
          />
        </label>
        <div className="mt-4 flex items-center gap-3">
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
          {saved && <span className="text-sm font-semibold text-emerald-700">Saved</span>}
        </div>
        {profile?.updatedAt && (
          <p className="mt-3 text-xs text-stone-400">Last updated {new Date(profile.updatedAt).toLocaleDateString()}</p>
        )}
      </section>
    </div>
  );
}
