import Link from "next/link";
import { currentAdmin } from "@/lib/admin-current";
import { AREA_LABELS, type AdminArea, mayUse, refusalFor } from "@/lib/admin-permissions";

/**
 * The gate on one area of the admin.
 *
 * WHY IT SITS IN A LAYOUT PER FOLDER rather than once in `app/admin/layout.tsx`:
 * a server layout is not told which path it is rendering. The single-place
 * version would have to be handed the path by the middleware, and the admin
 * layout already says why that is the wrong place to hold a decision like this
 * — middleware is routing, not authorisation, and anything that stops it
 * running would open every screen at once. A layout inside the folder knows
 * which area it is because it says so, needs nothing forwarded, and cannot be
 * skipped while the screen underneath it still renders.
 *
 * A folder with no gate is open to everybody who is in the admin at all, which
 * is how it worked before any of this. That is the safe direction for a
 * mistake, and a test walks the folders so the mistake gets noticed.
 */
export default async function AreaGate({ area, children }: { area: AdminArea; children: React.ReactNode }) {
  const { areas } = await currentAdmin();
  if (mayUse(areas, area)) return <>{children}</>;

  return (
    <div className="max-w-2xl border border-[var(--gold-light)] bg-[#FAF8F3] p-8">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--gold-ink)]">Not yours to open</p>
      <h1 className="mt-3 font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">
        {AREA_LABELS[area].label}
      </h1>
      {/* Said plainly, and never as "not found". Somebody who is signed in and
          holding a real grant should be told which door this is and that it is
          shut, not made to wonder whether the screen is broken. */}
      <p className="mt-4 leading-7 text-stone-600">{refusalFor(area)}</p>
      <p className="mt-3 text-sm leading-6 text-stone-500">
        {AREA_LABELS[area].blurb} Ask whoever gave you access if you need this part as well.
      </p>
      <Link
        href="/admin"
        className="mt-6 inline-flex min-h-11 items-center border border-[var(--navy)] bg-[var(--navy)] px-5 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:border-[var(--gold)] hover:bg-[var(--gold)]"
      >
        Back to the dashboard
      </Link>
    </div>
  );
}
