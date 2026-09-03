import Link from "next/link";
import { cookies } from "next/headers";
import { accountCookieName, getAccountData, getCurrentAccountData, resolveBusinessOwner, withTrips } from "@/lib/account-store";
import { getPlan } from "@/lib/account-plan-store";
import { tripBar } from "@/lib/trip-bar";

/**
 * WHICH TRIP AM I ON — on every screen that is about one.
 *
 * The advisor's work on a trip is six separate top-level pages: /itinerary,
 * /proposal, /addons, /forms, /payments, /group. Each is a standalone screen
 * operating on whichever trip is open on the account, and not one of them said
 * which trip that was. Getting from Payments to Proposals meant leaving
 * through the global menu and coming back in.
 *
 * The one screen that names a trip is the pipeline — the screen an advisor has
 * to leave in order to do any of this. So somebody with twenty clients carried
 * "the open trip is the Harpers" in their head across every page, and a
 * mistake was invisible: the screens look identical whichever trip is behind
 * them.
 *
 * WHAT IT DOES NOT DO. It adds no screens and no functionality — every link
 * goes somewhere that already existed, and /addons is in a menu for the first
 * time rather than being reachable only by typing the address. It is not a
 * trip switcher either: switching lives on the pipeline, which is where the
 * list of trips is, and a second way to change the open trip is how two
 * screens end up disagreeing about which one that is.
 *
 * A SERVER COMPONENT THAT READS AND DOES NOT THINK. Everything printed is
 * worked out by lib/trip-bar.ts, which is pure and tested — the dates, the
 * fallback name, and the rule about when the bar should not appear at all.
 * This half is the reading, so the half that can be got wrong is the half a
 * test can reach.
 *
 * `current` is passed rather than read from the pathname, because a server
 * component has no pathname and making this a client component to learn one
 * would put the account read in the browser.
 */
export default async function TripContextBar({ current }: { current: string }) {
  const cookie = (await cookies()).get(accountCookieName())?.value;
  const account = await getCurrentAccountData(cookie);
  if (!account) return null;

  const owner = await resolveBusinessOwner(account.email);
  const [plan, data] = await Promise.all([getPlan(owner), getAccountData(owner)]);
  const { trips, activeId } = withTrips(data);
  const bar = tripBar(trips.find((trip) => trip.id === activeId), plan);
  if (!bar) return null;

  return (
    <nav
      aria-label="This trip"
      className="border-b border-[var(--gold-light)] bg-[#FAF8F3] px-5 py-3 sm:px-8"
    >
      <div className="mx-auto max-w-6xl">
        {/* Who and when, above the where. The client's name is the thing an
            advisor checks they have the right screen by, so it leads. */}
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm leading-6">
          {bar.client && <span className="font-semibold text-[var(--navy)]">{bar.client}</span>}
          {bar.client && <span aria-hidden="true" className="text-stone-400">·</span>}
          <span className="font-semibold text-[var(--navy)]">{bar.title}</span>
          {bar.dates && (
            <>
              <span aria-hidden="true" className="text-stone-400">·</span>
              <span className="text-stone-600">{bar.dates}</span>
            </>
          )}
        </p>

        {/* Horizontally scrollable rather than wrapped, so six links do not
            become three rows of chrome above the content on a phone. */}
        <ul className="mt-2 flex gap-1 overflow-x-auto pb-0.5">
          {bar.places.map((place) => {
            const on = place.href === current;
            return (
              <li key={place.href} className="shrink-0">
                <Link
                  href={place.href}
                  aria-current={on ? "page" : undefined}
                  className={`inline-flex min-h-11 items-center rounded-full border px-3.5 text-xs font-bold transition ${
                    on
                      ? "border-[var(--navy)] bg-[var(--navy)] text-white"
                      : "border-[var(--gold-light)] bg-white text-[var(--navy)] hover:border-[var(--gold)]"
                  }`}
                >
                  {place.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
