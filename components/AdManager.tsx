"use client";

import { useState } from "react";
import { adConcerns, adState, performance, stateWord } from "@/lib/ad-performance";
import AdWizard from "@/components/AdWizard";
import { adStatus, describeAd } from "@/lib/ad-types";
import { blankPromotion, type Promotion } from "@/lib/admin-content";

// Every advertisement as a card that answers the four questions an owner has:
// is it running, where does it show, when, and is anybody clicking it.

const TONE: Record<string, string> = {
  good: "bg-emerald-100 text-emerald-900",
  info: "bg-sky-100 text-sky-900",
  warn: "bg-amber-100 text-amber-900",
  muted: "bg-stone-200 text-stone-700",
};

const buttonClass =
  "min-h-[36px] border border-[var(--gold-light)] px-3 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--navy)] transition hover:border-[var(--gold)] hover:bg-[var(--cream-deep)]";


/** What a failed save actually means, in the words the owner needs. */
function explainFailure(status: number, serverSaid?: string): string {
  if (status === 401) {
    return "You are not signed in as an administrator any more. Sign in again and retry — this happens after the session secret or the admin password changes, which ends every session that was open.";
  }
  if (status === 403) {
    return "The site refused the request because it did not appear to come from this page. Reload and try again.";
  }
  if (status === 503) {
    // Advertisements live in the Redis content store, NOT the Postgres
    // database, so pointing at DATABASE_URL here would send somebody to fix
    // the wrong thing. The route knows which store it meant; say its words.
    return `${serverSaid || "The store that holds advertisements is not connected, so nothing can be changed."} Advertisements are kept in the content store — check UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in Vercel, then Settings, then Connections. Reading works without it, which is why everything else looks fine.`;
  }
  if (status >= 500) {
    return `The database refused it. It may be asleep or missing its tables. Check Settings, then Connections.${serverSaid ? ` The site said: ${serverSaid}` : ""}`;
  }
  return serverSaid || `The site answered ${status} and would not say why.`;
}

/**
 * `today` comes from the server rather than being read here. Whether an advert
 * has finished depends on the date, and a component that reads the clock as it
 * draws is a component whose output changes for no reason — the same rule the
 * suggestions screen follows with readAt.
 */
export default function AdManager({ initial, configured, today }: { initial: Promotion[]; configured: boolean; today: string }) {
  const [ads, setAds] = useState(initial);
  const [editing, setEditing] = useState<Promotion | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  async function send(ad: Promotion, remove = false) {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: remove ? "promotion-delete" : "promotion", data: remove ? { id: ad.id } : ad }),
      });
      if (!res.ok) {
        // WHY THIS IS NOT ONE SENTENCE ANY MORE. Every failure here used to
        // read "Could not save. Check the connection and try again." — a
        // rejected sign-in, an unconnected database and a broken query all
        // looked identical, and the status code was captured and then thrown
        // away. The answer existed on the response and was never shown, so the
        // only way to find out was the browser's network panel.
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setMessage({ ok: false, text: explainFailure(res.status, body?.error) });
        return;
      }
      const data = (await res.json()) as { promotions?: Promotion[] };
      if (data.promotions) setAds(data.promotions);
      setMessage({ ok: true, text: remove ? "Deleted." : ad.enabled ? "Published — it is live now." : "Saved as a draft." });
      setEditing(null);
    } catch {
      // Nothing came back at all — the request never completed.
      setMessage({ ok: false, text: "The request did not reach the site. Check your connection and try again." });
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <>
        {message && (
          <p role="status" className={`mb-4 text-sm font-semibold ${message.ok ? "text-emerald-700" : "text-red-700"}`}>
            {message.text}
          </p>
        )}
        <AdWizard initial={editing} onSave={(ad) => void send(ad)} onCancel={() => setEditing(null)} saving={saving} />
      </>
    );
  }

  return (
    <div>
      {!configured && (
        <p className="mb-5 border-l-4 border-amber-400 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
          Advertisements need the private store connected before they can be saved.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-stone-600">
          {ads.length === 0 ? "No advertisements yet." : "Advertisements"}
        </p>
        <button
          type="button"
          onClick={() => setEditing(blankPromotion())}
          className="min-h-[44px] border border-[var(--navy)] bg-[var(--navy)] px-5 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:border-[var(--gold)] hover:bg-[var(--gold)]"
        >
          Create an advertisement
        </button>
      </div>

      {message && (
        <p role="status" className={`mt-4 text-sm font-semibold ${message.ok ? "text-emerald-700" : "text-red-700"}`}>
          {message.text}
        </p>
      )}

      {ads.length === 0 ? (
        <p className="mt-8 border border-dashed border-[var(--gold-light)] p-10 text-center text-sm text-stone-600">
          When you make one it will appear here, with how many people have seen it and how many clicked.
        </p>
      ) : (
        <ul className="mt-6 grid gap-5 lg:grid-cols-2">
          {ads.map((ad) => {
            const status = adStatus(ad);
            return (
              <li key={ad.id} className="flex flex-col border border-[var(--gold-light)] bg-[#FAF8F3] p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-[family-name:var(--font-display)] text-xl leading-tight text-[var(--navy)]">
                    {ad.title || "Untitled"}
                  </p>
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em] ${TONE[status.tone]}`}>
                    {status.label}
                  </span>
                </div>

                <p className="mt-2 text-sm text-stone-600">{describeAd(ad.placements)}</p>
                {/* Whose it is, on the card, so the list answers the question
                    without opening each advert. Only shown when recorded —
                    every advert made before this existed has none. */}
                {(ad.advertiserName || ad.advertiserPhone || ad.advertiserEmail) && (
                  <p className="mt-1 text-xs leading-5 text-stone-500">
                    {[ad.advertiserName, ad.advertiserPhone, ad.advertiserEmail].filter(Boolean).join(" · ")}
                  </p>
                )}
                <p className="mt-1 text-sm text-stone-500">
                  {ad.targetPaths ? `Only on ${ad.targetPaths}` : "On every page it can appear"}
                  {ad.device !== "all" ? ` · ${ad.device === "mobile" ? "phones only" : "computers only"}` : ""}
                </p>
                {(ad.startDate || ad.endDate) && (
                  <p className="mt-1 text-sm text-stone-500">
                    {ad.startDate || "any time"} → {ad.endDate || "no end"}
                  </p>
                )}

                {/* Whether it is running, and what its numbers may claim.
                    "12 seen · 3 clicked" was both of these badly: an advert
                    that finished in March still read as enabled, and three
                    from twelve is 25%, which sounds excellent and means
                    nothing. See lib/ad-performance.ts. */}
                <p className="mt-3 flex flex-wrap items-center gap-2">
                  <span className={`inline-block px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${
                    adState(ad, today) === "live"
                      ? "bg-emerald-100 text-emerald-900"
                      : adState(ad, today) === "nowhere"
                        ? "bg-red-100 text-red-900"
                        : adState(ad, today) === "finished"
                          ? "bg-amber-100 text-amber-900"
                          : "bg-stone-200 text-stone-700"
                  }`}>
                    {stateWord(adState(ad, today))}
                  </span>
                  <span className="text-sm text-stone-600">{performance(ad).says}</span>
                </p>

                {adConcerns(ad, today).length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {adConcerns(ad, today).map((concern) => (
                      <li key={concern.says} className={`text-sm leading-6 ${concern.weight === 1 ? "font-semibold text-red-800" : concern.weight === 2 ? "font-semibold text-amber-800" : "text-stone-600"}`}>
                        {concern.says}
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" onClick={() => setEditing(ad)} className={buttonClass}>
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void send({ ...ad, enabled: !ad.enabled })}
                    className={buttonClass}
                  >
                    {ad.enabled ? "Pause" : "Publish"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing({ ...ad, id: "", title: `${ad.title} (copy)`, enabled: false, impressions: 0, clicks: 0 })}
                    className={buttonClass}
                  >
                    Duplicate
                  </button>
                  {confirmDelete === ad.id ? (
                    <>
                      <span className="self-center text-sm text-stone-600">Delete for good?</span>
                      <button type="button" onClick={() => void send(ad, true)} className="min-h-[36px] border border-red-400 px-3 text-[11px] font-bold uppercase tracking-[0.1em] text-red-700 transition hover:bg-red-50">
                        Yes, delete
                      </button>
                      <button type="button" onClick={() => setConfirmDelete(null)} className={buttonClass}>
                        Keep
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(ad.id)}
                      className="min-h-[36px] border border-[var(--gold-light)] px-3 text-[11px] font-bold uppercase tracking-[0.1em] text-stone-500 transition hover:border-red-400 hover:text-red-700"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
