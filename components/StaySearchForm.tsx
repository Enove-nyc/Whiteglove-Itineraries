import Link from "next/link";
import { ACTION_BUTTON_CLASS } from "@/lib/action-button";
import { nextDay, today } from "@/lib/date-range";
import type { StaySearch } from "@/lib/stay-search";

/**
 * The search that starts a trip.
 *
 * IT GOES TO /hotels, NOT STRAIGHT TO A PARTNER. Pointing this at /go would
 * earn a commission one press sooner and throw away the only reason to search
 * here: a comparison site can list a hotel in Rome, and it cannot tell you that
 * the Ghetto is the quarter to be in or that the kosher hotel in Arosa is a
 * fortnight in August rather than a hotel. /hotels answers that, carries every
 * field across, and offers the partner hand-off underneath it.
 *
 * A PLAIN GET FORM, no JavaScript. Same reasoning as components/
 * PartnerSearchForm.tsx: this is the first thing anybody presses on the site,
 * so it should work before hydration, on a slow phone and with scripts off. The
 * browser builds the query string from the field names, which is also why the
 * names here are the same ones /go reads.
 *
 * NOTHING IS REQUIRED. A hotel search with no dates is a poor search, but the
 * visitor this form exists for is often the one who has not chosen the month
 * yet — and turning them away at the first field is how a front page loses the
 * person it was written for. Empty lands on the directory, which is a real
 * answer to "I do not know yet".
 */

const field =
  "mt-1.5 w-full rounded-md border border-[var(--gold-light)] bg-white px-3 py-2.5 text-base text-[var(--navy)] shadow-sm focus:border-[var(--gold)] focus:outline-none focus:ring-2 focus:ring-[var(--gold-light)] sm:text-sm";
const label = "text-[11px] font-bold uppercase tracking-[0.12em] text-stone-600";

export default function StaySearchForm({
  id,
  search,
  submitLabel = "Find my vacation",
  helpHref = "/plan",
  helpLabel = "Not sure where — help me choose",
}: {
  /** Prefixes the field ids, so two of these on one page stay distinct. */
  id: string;
  /** Prefills, when the page already knows what was asked for. */
  search?: Partial<StaySearch>;
  submitLabel?: string;
  /** The way out for somebody who has not chosen a destination. */
  helpHref?: string;
  helpLabel?: string;
}) {
  return (
    // data-search-memory opts this form in to components/SearchMemory.tsx,
    // which fills EMPTY fields from the last search. Opt-in rather than every
    // form on the site, so nothing writes into a field it was not meant to.
    <form
      action="/hotels"
      method="get"
      data-search-memory=""
      className="rounded-2xl border border-[var(--gold-light)] bg-[var(--surface)] p-5 shadow-[0_18px_45px_rgba(16, 47, 53,.09)] sm:p-6"
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block lg:col-span-2" htmlFor={`${id}-destination`}>
          <span className={label}>Where to</span>
          <input
            id={`${id}-destination`}
            name="destination"
            defaultValue={search?.destination ?? ""}
            placeholder="Rome, the Dolomites, anywhere warm"
            autoComplete="off"
            className={field}
          />
        </label>

        <label className="block" htmlFor={`${id}-in`}>
          <span className={label}>Check in</span>
          {/* Rendered on the server, so on a page that is prerendered this floor
              can be a few days stale. It is still worth having: it never
              refuses a date that is genuinely available, and SearchMemory
              re-stamps both fields with the browser's own today on arrival. */}
          <input id={`${id}-in`} name="in" type="date" min={today()} defaultValue={search?.checkIn ?? ""} className={field} />
        </label>
        <label className="block" htmlFor={`${id}-out`}>
          <span className={label}>Check out</span>
          <input id={`${id}-out`} name="out" type="date" min={nextDay(today())} defaultValue={search?.checkOut ?? ""} className={field} />
        </label>

        <label className="block" htmlFor={`${id}-adults`}>
          <span className={label}>Adults</span>
          <input
            id={`${id}-adults`}
            name="adults"
            type="number"
            min={1}
            max={30}
            inputMode="numeric"
            defaultValue={search?.adults ?? 2}
            className={field}
          />
        </label>
        <label className="block" htmlFor={`${id}-children`}>
          <span className={label}>Children</span>
          <input
            id={`${id}-children`}
            name="children"
            type="number"
            min={0}
            max={30}
            inputMode="numeric"
            defaultValue={search?.children ?? 0}
            className={field}
          />
        </label>
        <label className="block" htmlFor={`${id}-rooms`}>
          <span className={label}>Rooms</span>
          <input
            id={`${id}-rooms`}
            name="rooms"
            type="number"
            min={1}
            max={10}
            inputMode="numeric"
            defaultValue={search?.rooms ?? 1}
            className={field}
          />
        </label>

        <div className="flex items-end">
          <button
            type="submit"
            className={`inline-flex min-h-12 w-full items-center justify-center ${ACTION_BUTTON_CLASS.primary}`}
          >
            {submitLabel}
          </button>
        </div>
      </div>

      {helpHref ? (
        <p className="mt-4">
          <Link
            href={helpHref}
            className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--navy)] underline decoration-[var(--gold)] decoration-2 underline-offset-4"
          >
            {helpLabel} →
          </Link>
        </p>
      ) : null}
    </form>
  );
}
