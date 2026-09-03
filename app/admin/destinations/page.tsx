import Link from "next/link";
import CompletenessQueue from "@/components/CompletenessQueue";
import DbSetupButton from "@/components/DbSetupButton";
import DestinationEditor from "@/components/DestinationEditor";
import DestinationPicker from "@/components/DestinationPicker";
import CreateDestinationForm from "@/components/CreateDestinationForm";
import {
  getDestinationForAdmin,
  isDbEnabled,
  listDestinationsForAdmin,
  listLinksForAdmin,
} from "@/lib/content-admin";
import { optionalRead } from "@/lib/db-optional";

// Admin data must always reflect the latest DB state.
export const dynamic = "force-dynamic";

export default async function AdminDestinationsPage({
  searchParams,
}: {
  searchParams: Promise<{ slug?: string }>;
}) {
  const { slug } = await searchParams;
  const dbReady = isDbEnabled();

  // When DATABASE_URL is set but the tables aren't created/seeded yet, the
  // query throws (missing table) or returns nothing — either way, show setup.
  let destinations: Awaited<ReturnType<typeof listDestinationsForAdmin>> = [];
  let needsSetup = false;
  if (dbReady) {
    try {
      destinations = await listDestinationsForAdmin();
      needsSetup = destinations.length === 0;
    } catch {
      needsSetup = true;
    }
  }
  const selected =
    dbReady && !needsSetup && slug ? await getDestinationForAdmin(slug) : null;
  // READ SEPARATELY, AND ALLOWED TO FAIL — the same rule lib/content.ts
  // follows for anything newer than the database it may be talking to. Folding
  // this into getDestinationForAdmin's include would mean that on a database
  // without the DestinationLink migration the whole editor throws P2022 and
  // the owner loses every screen for that town, not just the links.
  const links = selected
    ? await optionalRead(`useful links for ${selected.slug}`, () => listLinksForAdmin(selected.id), [])
    : [];

  return (
    <>
      <header>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--gold-ink)]">White Glove admin</p>
            <h1 className="mt-3 font-[family-name:var(--font-display)] text-5xl leading-tight text-[var(--navy)]">
              Heritage towns
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-stone-600">
              The 123 towns with kevarim in them — Lizhensk, Kerestir, Uman. Shomrim numbers, cemetery access, minyanim,
              food and lodging: the practical details somebody needs to get to a kever. Changes go live within a minute.
            </p>
            {/* SAYING WHICH SCREEN IS WHICH, because "Towns" and
                "Destinations" did not. They are two lists that share exactly
                one place (Prague) and answer different questions. */}
            <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
              Rome, Venice, the Dolomites — where somebody goes on holiday — are on{" "}
              <Link
                href="/admin/vacation-destinations"
                className="font-semibold underline decoration-[var(--gold)] decoration-2 underline-offset-4"
              >
                Vacation destinations
              </Link>
              .
            </p>
          </div>
        </div>
      </header>

      {!dbReady ? (
        <section className="mx-auto max-w-3xl px-5 py-16 sm:px-8">
          <div className="border border-[var(--gold-light)] bg-[#FAF8F3] p-8">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--gold-ink)]">Not connected yet</p>
            <h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">The content database isn&apos;t connected.</h2>
            <p className="mt-4 text-sm leading-7 text-stone-600">
              Once the database is set up, this page becomes your editor for every destination&apos;s practical details. Setup is a one-time step: create a free Neon database, add its connection string as <code className="rounded bg-[var(--cream)] px-1">DATABASE_URL</code>, then run the import. Full instructions are in <code className="rounded bg-[var(--cream)] px-1">docs/DATABASE.md</code>.
            </p>
          </div>
        </section>
      ) : needsSetup ? (
        <section className="mx-auto max-w-3xl px-5 py-16 sm:px-8">
          <div className="border border-[var(--gold)] bg-[#FAF8F3] p-8">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--gold-ink)]">One-time setup</p>
            <h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">Set up your content database.</h2>
            <p className="mt-4 text-sm leading-7 text-stone-600">
              Your database is connected. Tap the button below once to create the tables and import all destinations from the current site (about 136 places). It takes roughly a minute. After it finishes, this page becomes your editor.
            </p>
            <div className="mt-6">
              <DbSetupButton
                label="Set up database & import destinations"
                reimport
                confirmMessage="This replaces every built-in record with the version that ships in the site. Anything you added under your own name is kept. Continue?"
              />
            </div>
            <p className="mt-4 text-xs leading-5 text-stone-500">
              Safe to run again later — it reloads the imported content from the site&apos;s built-in data. Your own added listings live in separate tables and are not touched.
            </p>
            {/* It used to only create tables, so a database set up before a
                column existed stayed without it and the only fix was a
                terminal. It now brings an older database up to date as well —
                measured: an April-era one, pressed once, comes out exactly
                matching the schema. */}
            <p className="mt-3 border-l-4 border-[var(--gold)] pl-3 text-xs leading-5 text-stone-500">
              This also brings an older database up to date — new columns, new kinds of listing, everything added
              since it was set up.
            </p>

            {/* The safe half on its own, because it is the one needed often.
                The import above replaces the built-in records; this touches no
                content at all, and it is what a database error is asking for. */}
            <div className="mt-6 border-t border-[var(--gold-light)] pt-5">
              <p className="text-xs leading-5 text-stone-500">
                Already set up, and a save failed with a database error? This adds whatever is missing and leaves
                every word you have entered alone.
              </p>
              <div className="mt-3">
                <DbSetupButton />
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section className="mx-auto grid max-w-7xl gap-8 px-5 py-10 sm:px-8 lg:grid-cols-[.9fr_2fr]">
          <aside className="lg:sticky lg:top-6 lg:self-start space-y-6">
            <CreateDestinationForm />
            <DestinationPicker destinations={destinations} selectedSlug={slug} />
            {/* Which records are thinnest, and what each is missing. The only
                place a percentage belongs. */}
            <CompletenessQueue />
            {/* The one that is needed often, and is safe. It was only ever
                reachable on the first-run setup screen, which disappears the
                moment the database is set up — so the only button left was the
                destructive one, and pressing that to fix a database error is
                how work got deleted. */}
            <div className="border border-[var(--gold)] bg-[#FAF8F3] p-5">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--gold-ink)]">Database</p>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                Adds anything the database is missing — new columns, new kinds of listing. Nothing you have entered
                is touched. If a save ever fails with a database error, this is what it is asking for.
              </p>
              <div className="mt-4">
                <DbSetupButton />
              </div>
            </div>

            {/* NO RE-IMPORT BUTTON HERE, deliberately. It used to sit below in a
                <details>, one press away from the safe button above it, and the
                two read almost alike: both mention the database, both talk about
                what is kept. The difference is that this one puts every imported
                record back to what ships in the site, so a correction made to a
                built-in phone number is gone. Collapsing it and asking for a
                confirmation was not enough — the owner asked for it gone rather
                than guarded, having come to this screen to fix a database error.

                The capability is not lost: the first-run panel above still
                imports the built-in content, which is the moment it is actually
                for, and `npm run db:seed` does it from a terminal. What is gone
                is the chance of pressing it while doing something else. */}
          </aside>

          <div>
            {selected ? (
              <DestinationEditor destination={selected} links={links} />
            ) : (
              <div className="border border-dashed border-[var(--gold-light)] p-10 text-center">
                <p className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">Pick a destination to start editing.</p>
                <p className="mt-2 text-sm text-stone-600">Choose a city on the left and press “Open editor.”</p>
              </div>
            )}
          </div>
        </section>
      )}
    </>
  );
}
