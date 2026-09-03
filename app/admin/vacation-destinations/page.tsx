import Link from "next/link";
import type { Photo } from "@prisma/client";
import CreateVacationDestinationForm from "@/components/CreateVacationDestinationForm";
import VacationDestinationEditor from "@/components/VacationDestinationEditor";
import VacationDestinationPicker from "@/components/VacationDestinationPicker";
import { listVacationDestinationsForAdmin } from "@/lib/vacation-destinations-view";
import { destinations as heritageTowns } from "@/data/destinations";
import { vacationDestinationPhotos, vacationDestinationsTableReady } from "@/lib/vacation-destinations-admin";
import DbSetupButton from "@/components/DbSetupButton";

// Admin data must always reflect the latest state.
export const dynamic = "force-dynamic";

/**
 * Where holiday destinations are edited.
 *
 * A SECOND SCREEN RATHER THAN A TAB ON TOWNS, because they are two different
 * lists that have always been separate on this site. Towns are places with
 * kevarim in them; these are places to go on holiday. Merging the screens
 * would mean one picker of three hundred entries where every second one is
 * answering a different question.
 *
 * They were only ever editable by changing code and deploying, which is why
 * Rome could not be found anywhere in here.
 */
export default async function AdminVacationDestinationsPage({
  searchParams,
}: {
  searchParams: Promise<{ slug?: string }>;
}) {
  const { slug } = await searchParams;
  const ready = await vacationDestinationsTableReady();
  const all = await listVacationDestinationsForAdmin();
  const selected = slug ? all.find((entry) => entry.destination.slug === slug) : undefined;
  const photos: Photo[] = selected ? ((await vacationDestinationPhotos(selected.destination.slug)) as Photo[]) : [];

  /**
   * The same place on both lists.
   *
   * Nearly nowhere is: 123 heritage towns and 21 holiday destinations share
   * exactly one place today. But when one does, editing it here and wondering
   * why the shomer's number has not changed is the obvious mistake, so the
   * screen points at the other record rather than leaving it to be guessed.
   */
  const alsoATown = selected
    ? heritageTowns.find(
        (town) =>
          town.slug === selected.destination.slug ||
          selected.destination.cities.some((city) => city.toLowerCase() === town.city.toLowerCase()),
      )
    : undefined;

  return (
    <>
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--gold-ink)]">White Glove admin</p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-5xl leading-tight text-[var(--navy)]">
          Vacation destinations
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-stone-600">
          The 21 places somebody goes on holiday — Rome, the Dolomites, Miami Beach. What you write here is the advice:
          why go, how long to give it, when in the year, what catches people out. The practical detail on each page is
          taken from your own listings in those towns, so it is never typed twice. Changes go live within a minute.
        </p>
        {/* SAYING WHICH SCREEN IS WHICH, because "Towns" and "Destinations"
            did not. Two lists, one place in common, different questions. */}
        <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
          Towns with kevarim in them — Lizhensk, Kerestir, Uman — are on{" "}
          <Link
            href="/admin/destinations"
            className="font-semibold underline decoration-[var(--gold)] decoration-2 underline-offset-4"
          >
            Heritage towns
          </Link>
          .
        </p>
      </header>

      {!ready && (
        <section className="mt-8 rounded-2xl border border-[var(--gold)] bg-[#FAF8F3] p-6">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--gold-ink)]">One thing first</p>
          <h2 className="mt-3 font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">
            The database needs one update before this screen can save.
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
            Holiday destinations are new, so your database has nowhere to put them yet. Press this once. It adds what
            is missing and leaves every word you have already entered alone. The list below still shows the
            destinations that ship with the site, and they are on the site as normal.
          </p>
          <div className="mt-5">
            <DbSetupButton />
          </div>
        </section>
      )}

      <section className="mt-10 grid gap-8 lg:grid-cols-[18rem_1fr]">
        <VacationDestinationPicker
          selectedSlug={slug}
          destinations={all.map(({ destination, hidden }) => ({
            slug: destination.slug,
            name: destination.name,
            country: destination.country,
            region: destination.region,
            cities: destination.cities,
            ownerAdded: destination.ownerAdded,
            edited: destination.edited,
            hidden,
          }))}
        />

        <div>
          {selected ? (
            <>
              {alsoATown && (
                <p className="mb-6 rounded-xl border border-[var(--gold-light)] bg-[var(--cream)] p-4 text-sm leading-6 text-stone-600">
                  {alsoATown.city} is on both lists. The holiday advice is here; its shomrim, minyanim and cemetery
                  details are on{" "}
                  <Link
                    href={`/admin/destinations?slug=${alsoATown.slug}`}
                    className="font-semibold underline decoration-[var(--gold)] decoration-2 underline-offset-4"
                  >
                    its Heritage towns page
                  </Link>
                  .
                </p>
              )}
              <VacationDestinationEditor
              destination={selected.destination}
              hidden={selected.hidden}
              hasRow={selected.hasRow}
              builtIn={!selected.destination.ownerAdded}
                photos={photos}
              />
            </>
          ) : (
            <div className="space-y-8">
              <div className="rounded-2xl border border-[var(--gold-light)] bg-white p-6">
                <p className="text-sm leading-6 text-stone-600">
                  Choose a destination on the left to edit its wording, its towns and its pictures — or add one below.
                </p>
              </div>
              <CreateVacationDestinationForm />
            </div>
          )}
        </div>
      </section>
    </>
  );
}
