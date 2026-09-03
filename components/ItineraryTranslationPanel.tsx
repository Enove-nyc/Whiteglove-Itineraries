"use client";

import { useEffect, useState } from "react";
import type { TranslatedItinerary } from "@/data/itinerary-translation";
import { Button } from "@/components/ui/Button";

const LANGUAGES = ["Spanish", "French", "Hebrew", "Yiddish", "Russian", "Portuguese", "Italian", "German"];

export default function ItineraryTranslationPanel() {
  const [tripId, setTripId] = useState("");
  const [language, setLanguage] = useState(LANGUAGES[0]);
  const [translation, setTranslation] = useState<TranslatedItinerary | null>(null);
  const [stale, setStale] = useState(false);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/account/translate?trip=current", { cache: "no-store" });
        const data = await res.json().catch(() => null);
        if (!active) return;
        if (!res.ok) setError(data?.error || "Could not load this trip.");
        else setTripId(data?.tripId || "");
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

  useEffect(() => {
    if (!tripId) return;
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/account/translate?trip=${encodeURIComponent(tripId)}&language=${encodeURIComponent(language)}`, { cache: "no-store" });
        const data = await res.json().catch(() => null);
        if (!active) return;
        if (res.ok) {
          setTranslation(data?.translation ?? null);
          setStale(Boolean(data?.stale));
        }
      } catch {
        // Leave whatever was showing.
      }
    })();
    return () => {
      active = false;
    };
  }, [tripId, language]);

  async function generate() {
    if (!tripId) return;
    setGenerating(true);
    setError("");
    try {
      const res = await fetch("/api/account/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId, language }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.translation) {
        setTranslation(data.translation);
        setStale(false);
      } else {
        setError(data?.error || "Could not translate this itinerary right now.");
      }
    } finally {
      setGenerating(false);
    }
  }

  if (loading) return <p className="text-sm text-stone-500">Loading…</p>;
  if (!tripId) return <p className="text-sm text-stone-500">Open a trip in the planner first.</p>;

  const activities = translation ? Object.entries(translation.activities) : [];
  const lodging = translation ? Object.entries(translation.lodging) : [];
  const flights = translation ? Object.entries(translation.flights) : [];

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-sm font-semibold text-red-700">{error}</p>}

      <label className="flex flex-col gap-1 text-xs font-semibold text-stone-600 sm:w-64">
        Language
        <select value={language} onChange={(e) => setLanguage(e.target.value)} className="rounded-lg border border-[var(--gold-light)] px-3 py-2 text-sm text-[var(--navy)]">
          {LANGUAGES.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </label>

      {!translation ? (
        <div className="rounded-xl border border-dashed border-[var(--gold-light)] p-6 text-center">
          <p className="text-sm text-stone-600">No {language} translation yet.</p>
          <div className="mt-3">
            <Button type="button" onClick={generate} disabled={generating}>
              {generating ? "Translating…" : `Translate to ${language}`}
            </Button>
          </div>
        </div>
      ) : (
        <>
          {stale && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              This trip has changed since it was translated — translate again to catch up.
            </div>
          )}
          {translation.title && <h3 className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">{translation.title}</h3>}

          {activities.length > 0 && (
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-stone-500">Stops</p>
              <ul className="mt-2 flex flex-col gap-2">
                {activities.map(([id, t]) => (
                  <li key={id} className="rounded-xl border border-[var(--gold-light)] bg-white p-3 text-sm">
                    {t.name && <p className="font-semibold text-[var(--navy)]">{t.name}</p>}
                    {t.notes && <p className="mt-1 text-stone-600">{t.notes}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {lodging.length > 0 && (
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-stone-500">Where you sleep</p>
              <ul className="mt-2 flex flex-col gap-2">
                {lodging.map(([id, t]) => (
                  <li key={id} className="rounded-xl border border-[var(--gold-light)] bg-white p-3 text-sm text-stone-600">
                    {t.notes}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {flights.length > 0 && (
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-stone-500">Flights</p>
              <ul className="mt-2 flex flex-col gap-2">
                {flights.map(([id, t]) => (
                  <li key={id} className="rounded-xl border border-[var(--gold-light)] bg-white p-3 text-sm text-stone-600">
                    {t.notes}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <Button type="button" variant="secondary" onClick={generate} disabled={generating}>
              {generating ? "Translating…" : "Translate again"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
