"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import HechsherBadge from "@/components/HechsherBadge";
import { clearHechsherAction, deleteAgencyAction, saveAgencyAction, saveHechsherAction, type ActionResult } from "@/app/admin/hechsherim/actions";
import { type Hechsher, type HechsherStatus } from "@/data/hechsherim";
import { curatedKosherPlaces, searchCuratedKosherPlaces } from "@/lib/curated-kosher";
import { hechsherOf } from "@/lib/use-hechsherim";

// Confirm a hechsher for White Glove's curated kosher listings, one place at a
// time. This editor never searches or creates listings from an external map.

const inputClass =
  "mt-1.5 w-full rounded-md border border-[var(--gold-light)] bg-white px-3 py-2.5 text-sm text-[var(--navy)] focus:border-[var(--gold)] focus:outline-none focus:ring-2 focus:ring-[var(--gold-light)]";
const captionClass = "text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500";
const smallButton =
  "min-h-[36px] border border-[var(--gold-light)] px-3 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--navy)] transition hover:border-[var(--gold)] hover:bg-[var(--cream-deep)] disabled:opacity-50";

export type ConfirmedRow = HechsherStatus & { placeId: string; placeName?: string; placeAddress?: string };

export default function HechsherEditor({ confirmed, agencies, ownAdded, storeReady }: {
  confirmed: ConfirmedRow[];
  /** Built-in agencies plus anything the owner has added or changed. */
  agencies: Hechsher[];
  /** Which ids the owner has touched, so only those offer a Remove. */
  ownAdded: string[];
  storeReady: boolean;
}) {
  // Find a White Glove listing by name, city, country, or address.
  const [find, setFind] = useState("");
  const [statuses, setStatuses] = useState<Record<string, HechsherStatus>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const places = useMemo(
    () => (find.trim() ? searchCuratedKosherPlaces(find) : curatedKosherPlaces()),
    [find],
  );

  const [saveState, saveAction, savePending] = useActionState<ActionResult | null, FormData>(saveHechsherAction, null);
  const [clearState, clearAction] = useActionState<ActionResult | null, FormData>(clearHechsherAction, null);
  const [agencyState, agencyAction, agencyPending] = useActionState<ActionResult | null, FormData>(saveAgencyAction, null);
  const [removeAgencyState, removeAgencyAction] = useActionState<ActionResult | null, FormData>(deleteAgencyAction, null);

  // Re-read after a save so the badge in the list matches what was just
  // stored. The form stays open on purpose — the badge changing underneath it
  // is the confirmation, and closing it would hide that.
  // THE EMPTY CASE MOVED INSIDE THE WRAPPER. It cleared the badges
  // synchronously before the fetch branch ever ran, which is the setState the
  // rule is about; the fetch branch was already async and always fine.
  useEffect(() => {
    let live = true;
    void (async () => {
      if (!places.length) {
        if (live) setStatuses({});
        return;
      }
      const ids = places.map((p) => p.id).join(",");
      const res = await fetch(`/api/kosher/hechsherim?ids=${encodeURIComponent(ids)}`);
      if (live && res.ok) setStatuses((await res.json()).hechsherim ?? {});
    })();
    return () => {
      live = false;
    };
  }, [saveState, clearState, places]);

  // One filter, used by both lists. Matching the address means "Kraków" finds
  // a shop whose name gives nothing away.
  const needle = find.trim().toLowerCase();
  const matches = (...fields: Array<string | undefined>) =>
    !needle || fields.some((f) => f?.toLowerCase().includes(needle));
  const visibleConfirmed = confirmed.filter((row) => matches(row.placeName, row.placeAddress, row.note));

  return (
    <div className="space-y-8">
      {!storeReady && (
        <p className="border-l-4 border-amber-400 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
          Confirming a hechsher needs the private store connected (UPSTASH_REDIS_REST_URL and _TOKEN). You can still
          review the curated listings, but cannot save a supervision status yet.
        </p>
      )}

      <section className="border border-[var(--gold-light)] bg-[#fcfaf6] p-6">
        <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">Find places to confirm</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
          Search White Glove&apos;s curated kosher listings and record the supervision you have checked. Nothing is
          guessed or imported from an external map.
        </p>

        <div className="mt-4 max-w-sm">
          <label className="block">
            <span className={captionClass}>Search listings</span>
            <input
              value={find}
              onChange={(event) => setFind(event.target.value)}
              placeholder="Shop, city, country or address…"
              className={inputClass}
            />
          </label>
        </div>

        {places.length === 0 ? (
          <p className="mt-5 text-sm text-stone-600">No curated kosher listings match that search.</p>
        ) : (
          <ul className="mt-5 divide-y divide-[var(--gold-light)] border-t border-[var(--gold-light)]">
            {places.map((p) => {
              const status = hechsherOf(statuses, p, agencies);
              return (
                <li key={p.id} className="py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-[var(--navy)]">{p.name}</p>
                      <p className="text-sm text-stone-500">{[p.category, p.city, p.country, p.address].filter(Boolean).join(" · ")}</p>
                      {status.state !== "unverified" && (
                        <div className="mt-2">
                          <HechsherBadge status={status} size="sm" agencies={agencies} />
                        </div>
                      )}
                    </div>
                    <button type="button" onClick={() => setEditing(editing === p.id ? null : p.id)} className={smallButton}>
                      {editing === p.id ? "Close" : "Set the hechsher"}
                    </button>
                  </div>

                  {editing === p.id && (
                    <form action={saveAction} className="mt-4 border border-[var(--gold-light)] bg-white p-4">
                      <input type="hidden" name="placeId" value={p.id} />
                      <input type="hidden" name="placeName" value={p.name} />
                      <input type="hidden" name="placeAddress" value={p.address ?? ""} />
                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="block">
                          <span className={captionClass}>What did you find?</span>
                          <select name="state" defaultValue={status.state === "unverified" ? "certified" : status.state} className={inputClass}>
                            <option value="certified">I confirmed it has a hechsher</option>
                            <option value="none">I confirmed it has none</option>
                            <option value="reported">Someone says so, I have not checked</option>
                          </select>
                        </label>
                        <label className="block">
                          <span className={captionClass}>Which hechsher</span>
                          <select name="hechsherId" defaultValue={status.hechsherId ?? ""} className={inputClass}>
                            <option value="">— not on the list —</option>
                            {agencies.map((h) => (
                              <option key={h.id} value={h.id}>
                                {h.name} ({h.region})
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="block sm:col-span-2">
                          <span className={captionClass}>If it is not on the list, type it</span>
                          <input name="note" defaultValue={status.note ?? ""} className={inputClass} />
                        </label>
                        <label className="block sm:col-span-2">
                          <span className={captionClass}>How you know *</span>
                          <input
                            name="source"
                            required
                            defaultValue={status.source ?? ""}
                            className={inputClass}
                            placeholder="Saw the teudah, spoke to the rov, the agency's own list…"
                          />
                        </label>
                      </div>
                      <div className="mt-4">
                        <button
                          type="submit"
                          disabled={savePending || !storeReady}
                          className="min-h-[44px] border border-[var(--navy)] bg-[var(--navy)] px-5 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:border-[var(--gold)] hover:bg-[var(--gold)] disabled:opacity-60"
                        >
                          {savePending ? "Saving…" : "Save"}
                        </button>
                      </div>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {saveState && (
          <p role="status" className={`mt-3 text-sm font-semibold ${saveState.ok ? "text-emerald-700" : "text-red-700"}`}>
            {saveState.message}
          </p>
        )}
      </section>

      <section className="border border-[var(--gold-light)] bg-[#fcfaf6] p-6">
        <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">
          Recorded
        </h2>
        {/* Looking a shop up by name, rather than remembering which town it
            was in and searching that town again. Filters both lists at once. */}
        <label className="mt-4 block max-w-sm">
          <span className={captionClass}>Search by name or address</span>
          <input
            value={find}
            onChange={(e) => setFind(e.target.value)}
            className={inputClass}
            placeholder="Shop, restaurant, street…"
          />
        </label>
        {needle && (
          <p className="mt-2 text-sm text-stone-600">
            {visibleConfirmed.length === 0
              ? `Nothing recorded matching “${find.trim()}”.`
              : "Filtered results."}
          </p>
        )}
        {confirmed.length === 0 ? (
          <p className="mt-3 text-sm text-stone-600">
            Nothing recorded yet. Add a supervision status when you have a source to record.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-[var(--gold-light)]">
            {visibleConfirmed.map((row) => (
              <li key={row.placeId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-semibold text-[var(--navy)]">{row.placeName || row.placeId}</p>
                  {row.placeAddress && <p className="text-sm text-stone-500">{row.placeAddress}</p>}
                  {row.source && <p className="text-sm text-stone-500">How you know: {row.source}</p>}
                  <div className="mt-2">
                    <HechsherBadge status={row} size="sm" agencies={agencies} />
                  </div>
                </div>
                <form action={clearAction}>
                  <input type="hidden" name="placeId" value={row.placeId} />
                  <button
                    type="submit"
                    className="min-h-[36px] border border-[var(--gold-light)] px-3 text-[11px] font-bold uppercase tracking-[0.1em] text-stone-500 transition hover:border-red-400 hover:text-red-700"
                  >
                    Clear saved status
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        {clearState && (
          <p role="status" className={`mt-3 text-sm font-semibold ${clearState.ok ? "text-emerald-700" : "text-red-700"}`}>
            {clearState.message}
          </p>
        )}
      </section>

      <AgencyList
        agencies={agencies}
        ownAdded={ownAdded}
        storeReady={storeReady}
        saveAction={agencyAction}
        savePending={agencyPending}
        saveState={agencyState}
        deleteAction={removeAgencyAction}
        deleteState={removeAgencyState}
      />
    </div>
  );
}

/**
 * The list of hechsherim itself — adding one, and putting a picture of the mark
 * on any of them.
 *
 * No list of certifying bodies is ever finished. A town has its own vaad, a rov
 * gives his own hechsher, and neither is in anybody's table. Until now the only
 * way to record one of those was to type it into the free-text box on each
 * place separately, which gave the same hechsher a different spelling in every
 * town and no mark at all.
 */
function AgencyList({ agencies, ownAdded, storeReady, saveAction, savePending, saveState, deleteAction, deleteState }: {
  agencies: Hechsher[];
  ownAdded: string[];
  storeReady: boolean;
  saveAction: (formData: FormData) => void;
  savePending: boolean;
  saveState: ActionResult | null;
  deleteAction: (formData: FormData) => void;
  deleteState: ActionResult | null;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState("");

  const needle = filter.trim().toLowerCase();
  const shown = agencies.filter(
    (h) => !needle || h.name.toLowerCase().includes(needle) || h.region.toLowerCase().includes(needle) || h.mark.toLowerCase().includes(needle),
  );

  return (
    <section className="border border-[var(--gold-light)] bg-[#fcfaf6] p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">
            The hechsherim themselves · {agencies.length}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
            The agencies you can choose from when confirming a place. Add the ones this list does not have — a town
            vaad, a rov who gives his own hechsher — and put a picture of the mark on any of them, added or built in.
          </p>
        </div>
        <button type="button" onClick={() => { setAdding((v) => !v); setEditing(null); }} className={smallButton}>
          {adding ? "Close" : "+ Add a hechsher"}
        </button>
      </div>

      {adding && <AgencyForm onSubmit={saveAction} pending={savePending} storeReady={storeReady} />}

      <label className="mt-5 block max-w-sm">
        <span className={captionClass}>Find one</span>
        <input value={filter} onChange={(e) => setFilter(e.target.value)} className={inputClass} placeholder="Name, region or mark…" />
      </label>

      <ul className="mt-4 divide-y divide-[var(--gold-light)] border-t border-[var(--gold-light)]">
        {shown.map((h) => (
          <li key={h.id} className="py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <HechsherBadge status={{ state: "certified", hechsherId: h.id }} size="sm" showLabel={false} agencies={agencies} />
                <div className="min-w-0">
                  <p className="font-semibold text-[var(--navy)]">
                    {h.name}
                    {ownAdded.includes(h.id) && (
                      <span className="ml-2 align-middle text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--gold-ink)]">Yours</span>
                    )}
                  </p>
                  <p className="text-sm text-stone-500">{h.region}{h.logo ? " · mark uploaded" : ""}</p>
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <button type="button" onClick={() => setEditing(editing === h.id ? null : h.id)} className={smallButton}>
                  {editing === h.id ? "Close" : h.logo ? "Change" : "Add a picture"}
                </button>
                {ownAdded.includes(h.id) && (
                  <form action={deleteAction}>
                    <input type="hidden" name="id" value={h.id} />
                    <button
                      type="submit"
                      className="min-h-[36px] border border-[var(--gold-light)] px-3 text-[11px] font-bold uppercase tracking-[0.1em] text-stone-500 transition hover:border-red-400 hover:text-red-700"
                    >
                      Remove
                    </button>
                  </form>
                )}
              </div>
            </div>
            {editing === h.id && <AgencyForm agency={h} onSubmit={saveAction} pending={savePending} storeReady={storeReady} />}
          </li>
        ))}
      </ul>

      {(saveState || deleteState) && (
        <p role="status" className={`mt-3 text-sm font-semibold ${(saveState ?? deleteState)!.ok ? "text-emerald-700" : "text-red-700"}`}>
          {(saveState ?? deleteState)!.message}
        </p>
      )}
    </section>
  );
}

/**
 * One agency's details and its mark.
 *
 * The picture is shrunk in the browser before it is sent. Two reasons, and the
 * second is the real one: a photograph of a teudah is several megabytes and the
 * store holds kilobytes, and converting through a canvas means whatever was
 * chosen — a screenshot, a photo, an SVG — arrives as a plain PNG of known
 * dimensions. An SVG is a document that can carry script; a canvas cannot
 * produce one, so the format that would need trusting never reaches the server.
 */
function AgencyForm({ agency, onSubmit, pending, storeReady }: {
  agency?: Hechsher;
  onSubmit: (formData: FormData) => void;
  pending: boolean;
  storeReady: boolean;
}) {
  const [logo, setLogo] = useState(agency?.logo ?? "");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");

  async function pickFile(file: File) {
    setProblem("");
    if (!file.type.startsWith("image/")) {
      setProblem("That is not a picture.");
      return;
    }
    setBusy(true);
    try {
      const bitmap = await createImageBitmap(file);
      // 256px is generous: the circle draws it at about thirty.
      const side = 256;
      const scale = Math.min(side / bitmap.width, side / bitmap.height, 1);
      const w = Math.max(1, Math.round(bitmap.width * scale));
      const h = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no canvas");
      ctx.drawImage(bitmap, 0, 0, w, h);
      setLogo(canvas.toDataURL("image/png"));
    } catch {
      setProblem("Could not read that picture. A PNG or JPEG works best.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form action={onSubmit} className="mt-4 border border-[var(--gold-light)] bg-white p-4">
      {agency && <input type="hidden" name="id" value={agency.id} />}
      <input type="hidden" name="logo" value={logo} />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={captionClass}>Name *</span>
          <input name="name" required defaultValue={agency?.name ?? ""} className={inputClass} placeholder="Vaad HaKashrus of…" />
        </label>
        <label className="block">
          <span className={captionClass}>What is written in the circle</span>
          <input name="mark" defaultValue={agency?.mark ?? ""} className={inputClass} placeholder="OU, בד״ץ, ★K…" maxLength={6} />
        </label>
        <label className="block">
          <span className={captionClass}>Where it certifies</span>
          <input name="region" defaultValue={agency?.region ?? ""} className={inputClass} placeholder="Lakewood · Eretz Yisrael · this town" />
        </label>
        <label className="block">
          <span className={captionClass}>Other spellings, comma separated</span>
          <input
            name="aliases"
            defaultValue={agency?.aliases.join(", ") ?? ""}
            className={inputClass}
            placeholder="so the same hechsher on a map tag lands here"
          />
        </label>

        <div className="sm:col-span-2">
          <span className={captionClass}>A picture of the mark</span>
          <div className="mt-2 flex flex-wrap items-center gap-4">
            <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-[var(--gold)] bg-white">
              {logo ? (
                /* eslint-disable-next-line @next/next/no-img-element -- a data
                   URI held in state; there is nothing for the optimizer to do. */
                <img src={logo} alt="" style={{ maxWidth: "72%", maxHeight: "72%" }} />
              ) : (
                <span className="text-[11px] font-bold text-stone-400">none</span>
              )}
            </span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void pickFile(file);
              }}
              className="text-sm text-stone-600 file:mr-3 file:border file:border-[var(--gold-light)] file:bg-white file:px-3 file:py-1.5 file:text-[11px] file:font-bold file:uppercase file:tracking-[0.1em] file:text-[var(--navy)]"
            />
            {logo && (
              <button type="button" onClick={() => setLogo("")} className={smallButton}>
                Remove the picture
              </button>
            )}
          </div>
          <p className="mt-2 text-xs leading-5 text-stone-500">
            Shrunk to 256 pixels in your browser before it is saved, so a photograph off a phone is fine. PNG, JPEG or
            WebP — an SVG is refused, because an SVG can carry script and this one would be shown to every visitor.
          </p>
          {busy && <p className="mt-2 text-xs text-stone-600">Reading the picture…</p>}
          {problem && <p className="mt-2 text-xs font-semibold text-red-700">{problem}</p>}
        </div>
      </div>
      <div className="mt-4">
        <button
          type="submit"
          disabled={pending || busy || !storeReady}
          className="min-h-[44px] border border-[var(--navy)] bg-[var(--navy)] px-5 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:border-[var(--gold)] hover:bg-[var(--gold)] disabled:opacity-60"
        >
          {pending ? "Saving…" : agency ? "Save" : "Add it"}
        </button>
      </div>
    </form>
  );
}
