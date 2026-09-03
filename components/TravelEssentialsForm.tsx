"use client";

import { startTransition, useActionState, useMemo, useState } from "react";
import { useFocusTrap } from "@/components/useFocusTrap";
import { saveTravelEssentialsAction } from "@/app/admin/settings/travel-essentials/actions";
import type { AffiliateConfig } from "@/lib/affiliate/partners";
import {
  configFor,
  describeEssentialService,
  ESSENTIAL_SERVICES,
  MAX_OFFERS_PER_SERVICE,
  mergeTravelEssentials,
  type EssentialOffer,
  type EssentialPageType,
  type EssentialServiceConfig,
  type EssentialServiceId,
  type TravelEssentialsSettings,
} from "@/lib/travel-essentials";

/**
 * Travel Essentials as a LIST and a POP-UP — not four full config cards stacked.
 *
 * Every service (insurance, eSIM, transfers, tours) used to lay its whole
 * configuration open on the page, so setting up one meant scrolling past the
 * other three. The page is now the two master switches and a compact list of
 * the services — each row shows whether it is on, and reorders — and pressing a
 * service opens its settings in a pop-up. Everything is saved as you go: a
 * toggle, a reorder, or closing the pop-up writes the whole set through the one
 * action, so there is no separate save step.
 */

const input =
  "mt-1.5 w-full rounded-md border border-[var(--gold-light)] bg-white px-3 py-2.5 text-sm text-[var(--navy)] focus:border-[var(--gold)] focus:outline-none focus:ring-2 focus:ring-[var(--gold-light)]";
const label = "text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500";

const PAGE_OPTIONS: Array<{ value: EssentialPageType; label: string }> = [
  { value: "destination", label: "Destination pages" },
  { value: "itinerary", label: "Itinerary planner" },
  { value: "book", label: "Booking page" },
  { value: "transfers", label: "Transfers page" },
  { value: "things-to-do", label: "Things to do" },
];

export default function TravelEssentialsForm({
  current,
  affiliate,
  storeReady,
}: {
  current: TravelEssentialsSettings;
  affiliate: AffiliateConfig;
  storeReady: boolean;
}) {
  const [settings, setSettings] = useState(() => mergeTravelEssentials(current));
  const [state, act, busy] = useActionState(saveTravelEssentialsAction, null);
  const [editing, setEditing] = useState<EssentialServiceId | null>(null);

  const dialogRef = useFocusTrap<HTMLDivElement>(Boolean(editing), () => closeModal());

  const ordered = useMemo(
    () =>
      ESSENTIAL_SERVICES.map((def) => ({ def, cfg: configFor(settings, def) })).sort(
        (a, b) => a.cfg.order - b.cfg.order || a.def.name.localeCompare(b.def.name),
      ),
    [settings],
  );

  /** Save the whole set through the one action — the settings travel as JSON. */
  function persist(next: TravelEssentialsSettings) {
    if (!storeReady) return;
    const fd = new FormData();
    fd.set("settings", JSON.stringify(next));
    startTransition(() => act(fd));
  }
  /** Change something at the list level (a toggle, a reorder) and save it now. */
  function update(next: TravelEssentialsSettings) {
    setSettings(next);
    persist(next);
  }

  // Inside the pop-up, edits only touch local state; closing writes them. That
  // keeps a save off every keystroke while still saving without a save button.
  function closeModal() {
    persist(settings);
    setEditing(null);
  }

  const patchService = (id: EssentialServiceId, patch: Partial<EssentialServiceConfig>) => {
    setSettings((prev) => ({
      ...prev,
      services: { ...prev.services, [id]: { ...prev.services[id], ...patch } },
    }));
  };

  const patchOffer = (id: EssentialServiceId, index: number, patch: Partial<EssentialOffer>) => {
    setSettings((prev) => {
      const extra = [...(prev.services[id].extra ?? [])];
      extra[index] = { ...extra[index], ...patch };
      return { ...prev, services: { ...prev.services, [id]: { ...prev.services[id], extra } } };
    });
  };

  const addOffer = (id: EssentialServiceId) => {
    setSettings((prev) => {
      const extra = [...(prev.services[id].extra ?? [])];
      if (extra.length >= MAX_OFFERS_PER_SERVICE - 1) return prev;
      extra.push({ label: "", url: "", cta: "", blurb: "", enabled: false });
      return { ...prev, services: { ...prev.services, [id]: { ...prev.services[id], extra } } };
    });
  };

  const removeOffer = (id: EssentialServiceId, index: number) => {
    setSettings((prev) => {
      const extra = (prev.services[id].extra ?? []).filter((_, i) => i !== index);
      return { ...prev, services: { ...prev.services, [id]: { ...prev.services[id], extra } } };
    });
  };

  const move = (id: EssentialServiceId, direction: -1 | 1) => {
    const ids = ordered.map((row) => row.def.id);
    const index = ids.indexOf(id);
    const swap = index + direction;
    if (index < 0 || swap < 0 || swap >= ids.length) return;
    const nextOrder = { ...settings.services };
    const a = ids[index];
    const b = ids[swap];
    const orderA = nextOrder[a].order;
    nextOrder[a] = { ...nextOrder[a], order: nextOrder[b].order };
    nextOrder[b] = { ...nextOrder[b], order: orderA };
    update({ ...settings, services: nextOrder });
  };

  const togglePage = (id: EssentialServiceId, page: EssentialPageType) => {
    const currentPages = settings.services[id].pageTypes;
    const next = currentPages.includes(page) ? currentPages.filter((p) => p !== page) : [...currentPages, page];
    patchService(id, { pageTypes: next });
  };

  const openRow = editing ? ordered.find((row) => row.def.id === editing) : null;

  return (
    <div className="mt-6 space-y-6">
      {!storeReady && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          The private store is not connected (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN). Changes cannot be saved
          until it is.
        </p>
      )}

      {/* The two master switches stay in the open — they are the whole section's
          on/off, not one service's. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex items-start gap-3 rounded-lg border border-[var(--gold-light)] bg-[#FAF8F3] p-4">
          <input
            type="checkbox"
            checked={settings.sectionEnabled}
            onChange={(e) => update({ ...settings, sectionEnabled: e.target.checked })}
            className="mt-1"
          />
          <span>
            <span className="block text-sm font-semibold text-[var(--navy)]">Show Travel Essentials</span>
            <span className="mt-1 block text-xs leading-5 text-stone-500">
              Master switch. Off hides every card on destination, itinerary and booking pages.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-3 rounded-lg border border-[var(--gold-light)] bg-[#FAF8F3] p-4">
          <input
            type="checkbox"
            checked={settings.showDisclosure}
            onChange={(e) => update({ ...settings, showDisclosure: e.target.checked })}
            className="mt-1"
          />
          <span>
            <span className="block text-sm font-semibold text-[var(--navy)]">Show commission disclosure</span>
            <span className="mt-1 block text-xs leading-5 text-stone-500">
              Visible sentence above the cards. Full explanation stays in Terms.
            </span>
          </span>
        </label>
      </div>

      <div className="flex items-center gap-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--gold-ink)]">Services</p>
        {busy && <span className="text-xs font-semibold text-stone-500">Saving…</span>}
        {!busy && state && (
          <span className={`text-xs font-semibold ${state.ok ? "text-emerald-700" : "text-red-700"}`} role="status">
            {state.ok ? "Saved." : state.message}
          </span>
        )}
      </div>

      {/* The list: a service per row, pressable to configure. The fields live in
          the pop-up, not stacked down the page. */}
      <ul className="divide-y divide-[var(--gold-light)] rounded-lg border border-[var(--gold-light)]">
        {ordered.map(({ def, cfg }, index) => (
          <li key={def.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <button type="button" onClick={() => setEditing(def.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
              <span className="text-xl text-[var(--gold-ink)]" aria-hidden="true">
                {def.icon}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-semibold text-[var(--navy)] underline decoration-[var(--gold-light)] decoration-2 underline-offset-4">
                  {def.name}
                </span>
                <span className="mt-0.5 block truncate text-xs text-stone-500">
                  {describeEssentialService(def.id, settings, affiliate)}
                </span>
              </span>
            </button>
            <div className="flex items-center gap-2">
              <span
                className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] ${
                  cfg.enabled
                    ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                    : "border-stone-300 bg-stone-50 text-stone-600"
                }`}
              >
                {cfg.enabled ? "On" : "Off"}
              </span>
              <button
                type="button"
                onClick={() => move(def.id, -1)}
                disabled={index === 0}
                className="border border-[var(--gold-light)] px-2 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--navy)] disabled:opacity-40"
              >
                Up
              </button>
              <button
                type="button"
                onClick={() => move(def.id, 1)}
                disabled={index === ordered.length - 1}
                className="border border-[var(--gold-light)] px-2 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--navy)] disabled:opacity-40"
              >
                Down
              </button>
            </div>
          </li>
        ))}
      </ul>

      {/* The pop-up — one service's full configuration. */}
      {openRow && editing && (
        <div
          className="fixed inset-0 z-[var(--wg-z-modal,200)] flex items-end justify-center bg-[var(--navy)]/50 p-4 backdrop-blur-[2px] sm:items-center"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeModal();
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="essential-modal-title"
            className="max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[var(--gold-light)] bg-white p-6 shadow-[0_24px_60px_rgba(16, 47, 53,.20)] sm:p-8"
          >
            {(() => {
              const { def, cfg } = openRow;
              return (
                <>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xl text-[var(--gold-ink)]" aria-hidden="true">
                        {def.icon}
                      </p>
                      <h2 id="essential-modal-title" className="mt-1 font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">
                        {def.name}
                      </h2>
                      <p className="mt-1 text-xs font-bold uppercase tracking-[0.12em] text-stone-500">
                        {def.linkMode === "landing" ? "Landing link" : "Search hand-off"} ·{" "}
                        {def.preferredNetwork === "either"
                          ? "Stay22 or Travelpayouts"
                          : def.preferredNetwork === "stay22"
                            ? "Stay22"
                            : "Travelpayouts"}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 text-sm text-[var(--navy)]">
                        <input
                          type="checkbox"
                          checked={cfg.enabled}
                          onChange={(e) => patchService(def.id, { enabled: e.target.checked })}
                        />
                        Enabled
                      </label>
                      <button
                        type="button"
                        onClick={closeModal}
                        className="text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500 transition hover:text-[var(--navy)]"
                      >
                        Done
                      </button>
                    </div>
                  </div>

                  {def.adminNote && <p className="mt-3 text-sm leading-6 text-stone-600">{def.adminNote}</p>}
                  <p className="mt-3 text-xs leading-5 text-stone-500">{describeEssentialService(def.id, settings, affiliate)}</p>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className={label}>Button words</span>
                      <input type="text" value={cfg.cta} onChange={(e) => patchService(def.id, { cta: e.target.value })} placeholder={def.cta} className={input} />
                    </label>
                    <label className="block">
                      <span className={label}>Line under the title</span>
                      <input type="text" value={cfg.blurb} onChange={(e) => patchService(def.id, { blurb: e.target.value })} placeholder={def.blurb} className={input} />
                    </label>
                  </div>

                  {def.linkMode === "landing" && (
                    <>
                      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_2fr]">
                        <label className="block">
                          <span className={label}>Provider name</span>
                          <input
                            type="text"
                            value={cfg.label ?? ""}
                            onChange={(e) => patchService(def.id, { label: e.target.value })}
                            placeholder={(cfg.extra ?? []).length > 0 ? "e.g. Airalo — needed, there are two" : "Optional while there is only one"}
                            className={input}
                          />
                        </label>
                        <label className="block">
                          <span className={label}>Tracked affiliate URL / programme link</span>
                          <input type="url" value={cfg.url} onChange={(e) => patchService(def.id, { url: e.target.value })} placeholder="https://tp.media/r?marker=…&u=…" className={`${input} font-mono text-xs`} />
                        </label>
                      </div>

                      {(cfg.extra ?? []).map((offer, offerIndex) => (
                        <div key={offerIndex} className="mt-3 rounded-lg border border-[var(--gold-light)] bg-[#FAF8F3] p-3">
                          <div className="flex items-center justify-between gap-3">
                            <span className={label}>Also offer</span>
                            <div className="flex items-center gap-3">
                              <label className="flex items-center gap-2 text-sm text-[var(--navy)]">
                                <input type="checkbox" checked={offer.enabled} onChange={(e) => patchOffer(def.id, offerIndex, { enabled: e.target.checked })} />
                                Enabled
                              </label>
                              <button type="button" onClick={() => removeOffer(def.id, offerIndex)} className="border border-[var(--gold-light)] px-2 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--navy)]">
                                Remove
                              </button>
                            </div>
                          </div>
                          <div className="mt-2 grid gap-3 sm:grid-cols-[1fr_2fr]">
                            <label className="block">
                              <span className={label}>Provider name</span>
                              <input type="text" value={offer.label} onChange={(e) => patchOffer(def.id, offerIndex, { label: e.target.value })} placeholder="e.g. Yesim" className={input} />
                            </label>
                            <label className="block">
                              <span className={label}>Tracked affiliate URL</span>
                              <input type="url" value={offer.url} onChange={(e) => patchOffer(def.id, offerIndex, { url: e.target.value })} placeholder="https://tp.media/r?marker=…&u=…" className={`${input} font-mono text-xs`} />
                            </label>
                          </div>
                          <label className="mt-2 block">
                            <span className={label}>Line under the title</span>
                            <input type="text" value={offer.blurb} onChange={(e) => patchOffer(def.id, offerIndex, { blurb: e.target.value })} placeholder={def.blurb} className={input} />
                          </label>
                          {!offer.label.trim() && offer.url.trim() && (
                            <p className="mt-2 text-xs leading-5 text-amber-800">
                              Not shown — give it a name, or travellers cannot tell it from the first one.
                            </p>
                          )}
                        </div>
                      ))}

                      {(cfg.extra ?? []).length < MAX_OFFERS_PER_SERVICE - 1 && (
                        <button type="button" onClick={() => addOffer(def.id)} className="mt-3 border border-[var(--gold)] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--navy)]">
                          Add another provider
                        </button>
                      )}
                    </>
                  )}

                  <fieldset className="mt-4">
                    <legend className={label}>Show on</legend>
                    <div className="mt-2 flex flex-wrap gap-4">
                      {PAGE_OPTIONS.map((opt) => (
                        <label key={opt.value} className="flex items-center gap-2 text-sm text-[var(--navy)]">
                          <input type="checkbox" checked={cfg.pageTypes.includes(opt.value)} onChange={() => togglePage(def.id, opt.value)} />
                          {opt.label}
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  <label className="mt-3 block">
                    <span className={label}>Destination slugs only (optional)</span>
                    <input
                      type="text"
                      value={cfg.destinations.join(", ")}
                      onChange={(e) =>
                        patchService(def.id, {
                          destinations: e.target.value.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
                        })
                      }
                      placeholder="Leave blank for all destinations — e.g. rome, paris"
                      className={input}
                    />
                  </label>

                  <div className="mt-6 flex items-center gap-3 border-t border-[var(--gold-light)] pt-5">
                    <button
                      type="button"
                      onClick={closeModal}
                      disabled={busy || !storeReady}
                      className="border border-[var(--navy)] bg-[var(--navy)] px-6 py-3 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:bg-[var(--gold)] disabled:opacity-50"
                    >
                      {busy ? "Saving…" : "Done"}
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
