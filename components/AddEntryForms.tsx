"use client";

import AddressAutocomplete from "@/components/AddressAutocomplete";
import ListingCategoryField from "@/components/ListingCategoryField";

import Link from "next/link";
import { useActionState } from "react";
import { type ActionResult, addAttractionAction, addCemeteryAction, addInfoPageAction, addKosherStayAction } from "@/app/admin/add/actions";

const inputClass =
  "mt-1.5 w-full rounded-md border border-[var(--gold-light)] bg-white px-3 py-2.5 text-sm text-[var(--navy)] shadow-sm focus:border-[var(--gold)] focus:outline-none focus:ring-2 focus:ring-[var(--gold-light)]";
const captionClass = "text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500";
const cardClass = "border border-[var(--gold-light)] bg-[#FAF8F3] p-6";
const submitClass =
  "border border-[var(--navy)] bg-[var(--navy)] px-5 py-3 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:bg-[var(--gold)] hover:border-[var(--gold)] disabled:opacity-60";

function Status({ state }: { state: ActionResult | null }) {
  if (!state) return null;
  return <span className={`text-sm font-semibold ${state.ok ? "text-emerald-700" : "text-red-700"}`}>{state.message}</span>;
}

/**
 * `prefillName` comes from the report of searches that found nothing.
 *
 * Somebody searched for "shinov", the site had never heard of it, and the
 * owner pressed "Add it". Making them retype the word they just read is the
 * friction that stops a report being acted on — so it arrives in the name
 * field, where it can be cleared like anything else.
 */
export default function AddEntryForms({ prefillName }: { prefillName?: string }) {
  const [cemState, cemAction, cemPending] = useActionState<ActionResult | null, FormData>(addCemeteryAction, null);
  const [pageState, pageAction, pagePending] = useActionState<ActionResult | null, FormData>(addInfoPageAction, null);
  const [attrState, attrAction, attrPending] = useActionState<ActionResult | null, FormData>(addAttractionAction, null);
  const [stayState, stayAction, stayPending] = useActionState<ActionResult | null, FormData>(addKosherStayAction, null);

  return (
    <div className="space-y-8">
      {/* New cemetery */}
      <form action={cemAction} className={cardClass}>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--gold-ink)]">New beis hachaim</p>
        <h2 className="mt-1 font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">Add a cemetery</h2>
        <p className="mt-2 text-sm leading-6 text-stone-600">Only a name and city are required — fill in the rest later. It appears in the directory right away, marked for verification.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block"><span className={captionClass}>Cemetery name *</span><input name="name" defaultValue={prefillName} className={inputClass} required /></label>
          <label className="block"><span className={captionClass}>Yiddish/Hebrew name</span><input name="yiddishName" dir="rtl" lang="yi" className={inputClass} /></label>
          <label className="block"><span className={captionClass}>City *</span><input name="city" className={inputClass} required /></label>
          <label className="block"><span className={captionClass}>City (Yiddish)</span><input name="yiddishCity" dir="rtl" lang="yi" className={inputClass} /></label>
          <label className="block"><span className={captionClass}>Country</span><input name="country" className={inputClass} /></label>
          <label className="block"><span className={captionClass}>Coordinates</span><input name="coordinates" className={inputClass} placeholder="50.0512, 19.9448" /></label>
          <label className="block sm:col-span-2"><span className={captionClass}>Address</span><AddressAutocomplete name="address" className={inputClass} placeholder="Start typing the address…" /></label>
          <label className="block sm:col-span-2"><span className={captionClass}>Access note</span><textarea name="accessNote" rows={2} className={inputClass} /></label>
          <label className="block sm:col-span-2"><span className={captionClass}>Source URL</span><input name="sourceUrl" className={inputClass} /></label>
        </div>
        <div className="mt-5 flex items-center gap-4">
          <button type="submit" disabled={cemPending} className={submitClass}>{cemPending ? "Adding…" : "Add cemetery"}</button>
          <Status state={cemState} />
        </div>
      </form>

      {/* New tzadik — this screen's picker could only ever list cemeteries that
          had a database row, which the 97 built-in batei hachaim don't. Adding a
          person now lives on /admin/kevarim, where every beis hachaim on the
          site is offered and the row is created on demand. */}
      <div className={cardClass}>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--gold-ink)]">New kever</p>
        <h2 className="mt-1 font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">Add a tzadik</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
          Adding a person has its own screen now, so you can pick any beis hachaim on the site — including the
          built-in ones — see who is already listed there, and take someone off again if you add him by mistake.
        </p>
        <Link href="/admin/kevarim" className={`mt-5 inline-block ${submitClass}`}>Open the kevarim screen</Link>
      </div>

      {/* Something to do. Goes into the same table the built-in things-to-do
          list is seeded into, so it is in the directory, the /stops search and
          the planner's picker straight away — no redeploy. */}
      <form action={attrAction} className={cardClass}>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--gold-ink)]">New thing to do</p>
        <h2 className="mt-1 font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">Add somewhere to go</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
          A museum, a mountain, a castle, somewhere for the children. It does not have to be Jewish, and it does not need
          a kosher label — suitable for Orthodox travelers is not the same as kosher-only. It must still be a place those
          travelers would go (no clubs, nightlife, mixed concerts, or similar). It appears on the things-to-do page, in
          the search, and in the planner as soon as you save it.
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block"><span className={captionClass}>Name *</span><input name="name" defaultValue={prefillName} className={inputClass} required /></label>
          <ListingCategoryField name="kind" defaultValue="Landmark" className={inputClass} label="Category" required />
          <label className="block"><span className={captionClass}>City *</span><input name="city" className={inputClass} required /></label>
          <label className="block"><span className={captionClass}>Country</span><input name="country" className={inputClass} /></label>
          <label className="block sm:col-span-2"><span className={captionClass}>One line — what it is, and why it is worth the half day *</span><input name="summary" className={inputClass} required /></label>
          <label className="block sm:col-span-2"><span className={captionClass}>Address</span><AddressAutocomplete name="address" className={inputClass} placeholder="Start typing the address…" /></label>
          <label className="block"><span className={captionClass}>Coordinates</span><input name="coordinates" className={inputClass} placeholder="41.8902, 12.4922" /></label>
          <label className="block"><span className={captionClass}>Official website</span><input name="website" className={inputClass} /></label>
          <label className="block sm:col-span-2"><span className={captionClass}>Practical notes — one per line</span><textarea name="notes" rows={3} className={inputClass} /></label>
          <label className="block sm:col-span-2"><span className={captionClass}>Source *</span><input name="sourceUrl" className={inputClass} placeholder="https://…" required /></label>
        </div>
        <p className="mt-4 max-w-2xl text-xs leading-5 text-stone-500">
          Hours and ticket prices are deliberately not stored — they change every season, and a stale hour printed here
          would be worse than none. Link the official site instead.
        </p>
        <div className="mt-5 flex items-center gap-4">
          <button type="submit" disabled={attrPending} className={submitClass}>{attrPending ? "Adding…" : "Add it"}</button>
          <Status state={attrState} />
        </div>
      </form>

      {/* Somewhere to stay. */}
      <form action={stayAction} className={cardClass}>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--gold-ink)]">New place to stay</p>
        <h2 className="mt-1 font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">Add somewhere to stay</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
          Distances are measured from the shul or quarter it is near, not from the hotel — so that is what you fill in.
          It appears on the where-to-stay page, in the search, and in the planner&rsquo;s hotel picker.
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block"><span className={captionClass}>Name *</span><input name="name" defaultValue={prefillName} className={inputClass} required /></label>
          <label className="block"><span className={captionClass}>Kind</span>
            <select name="kind" className={inputClass} defaultValue="Ordinary hotel, well placed">
              <option>Kosher hotel</option>
              <option>Kosher B&amp;B</option>
              <option>Seasonal kosher programme</option>
              <option>Kosher-friendly, in the Jewish quarter</option>
              <option>Ordinary hotel, well placed</option>
            </select>
          </label>
          <label className="block"><span className={captionClass}>City *</span><input name="city" className={inputClass} required /></label>
          <label className="block"><span className={captionClass}>Country</span><input name="country" className={inputClass} /></label>
          <label className="block sm:col-span-2"><span className={captionClass}>One line — what it is *</span><input name="summary" className={inputClass} required /></label>
          <label className="block"><span className={captionClass}>Measured from — the shul or quarter *</span><input name="anchorName" className={inputClass} placeholder="Great Synagogue of Rome" required /></label>
          <label className="block"><span className={captionClass}>That place&rsquo;s coordinates *</span><input name="anchorCoords" className={inputClass} placeholder="41.8921, 12.4780" required /></label>
          <label className="block"><span className={captionClass}>Kashrus</span>
            <select name="kosherClaim" className={inputClass} defaultValue="none">
              <option value="none">No kosher claim — listed for where it stands</option>
              <option value="reported">Reported kosher — not checked by us</option>
              <option value="confirmed">Confirmed — you checked it yourself</option>
            </select>
          </label>
          <label className="block"><span className={captionClass}>Season, if it is a programme rather than a place</span><input name="season" className={inputClass} placeholder="Pesach only; July–August" /></label>
          <label className="block sm:col-span-2"><span className={captionClass}>Website</span><input name="website" className={inputClass} /></label>
          <label className="block sm:col-span-2"><span className={captionClass}>Notes — one per line</span><textarea name="notes" rows={3} className={inputClass} /></label>
          <label className="block sm:col-span-2"><span className={captionClass}>Source *</span><input name="sourceUrl" className={inputClass} placeholder="https://…" required /></label>
        </div>
        <p className="mt-4 max-w-2xl text-xs leading-5 text-stone-500">
          Choose <strong>Confirmed</strong> only for kashrus you checked with the hotel or its mashgiach yourself. A
          plain hotel with no kosher claim gets no kashrus caveat printed under it — it never claimed anything.
        </p>

        <div className="mt-5 border-t border-[var(--gold-light)] pt-5">
          <p className={captionClass}>Kosher / Shabbos attributes</p>
          <p className="mt-1 text-xs leading-5 text-stone-500">
            Leave anything you have not checked as &ldquo;Not checked&rdquo; — it stays invisible to customers. Only a
            &ldquo;Yes&rdquo; ever shows as a badge on the card or matches a filter.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {[
              ["onSiteKosherFood", "On-site kosher food"],
              ["kosherKitchen", "Kosher kitchen"],
              ["kosherBreakfast", "Kosher breakfast"],
              ["shabbosMeals", "Shabbos meals available"],
              ["nearbyKosherFood", "Kosher food nearby"],
              ["nearbyShulOrMinyan", "Shul / minyan nearby"],
              ["eruv", "Within an eruv"],
              ["shabbosElevator", "Shabbos elevator"],
              ["kitchenSelfCatering", "Self-catering kitchen"],
              ["walkingDistanceToJewishArea", "Walking distance to Jewish area"],
            ].map(([key, label]) => (
              <label className="block" key={key}>
                <span className={captionClass}>{label}</span>
                <select name={key} className={inputClass} defaultValue="unknown">
                  <option value="unknown">Not checked</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </label>
            ))}
            <label className="block sm:col-span-2">
              <span className={captionClass}>Shabbos access info — keys, entry codes, anything relevant</span>
              <input name="shabbosAccessInfo" className={inputClass} placeholder="Optional" />
            </label>
          </div>
        </div>
        <div className="mt-5 flex items-center gap-4">
          <button type="submit" disabled={stayPending} className={submitClass}>{stayPending ? "Adding…" : "Add it"}</button>
          <Status state={stayState} />
        </div>
      </form>

      {/* New page */}
      <form action={pageAction} className={cardClass}>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--gold-ink)]">New page</p>
        <h2 className="mt-1 font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">Add an info page</h2>
        <p className="mt-2 text-sm leading-6 text-stone-600">Create a standalone page with its own link (/info/…). Blank lines make paragraphs; start a line with &ldquo;## &rdquo; for a heading or &ldquo;- &rdquo; for a bullet.</p>
        <div className="mt-5 grid gap-4">
          <label className="block"><span className={captionClass}>Page title *</span><input name="title" className={inputClass} required /></label>
          <label className="block"><span className={captionClass}>Body</span><textarea name="body" rows={6} className={inputClass} placeholder="Write the page here — you can fill this in later too." /></label>
          <label className="block"><span className={captionClass}>Visibility</span>
            <select name="status" className={inputClass} defaultValue="PUBLISHED">
              <option value="PUBLISHED">Published — visible</option>
              <option value="DRAFT">Draft — hidden</option>
              <option value="NEEDS_REVIEW">Needs review — hidden</option>
            </select>
          </label>
        </div>
        <div className="mt-5 flex items-center gap-4">
          <button type="submit" disabled={pagePending} className={submitClass}>{pagePending ? "Creating…" : "Create page"}</button>
          <Status state={pageState} />
        </div>
      </form>
    </div>
  );
}
