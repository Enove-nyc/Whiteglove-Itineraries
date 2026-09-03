import Link from "next/link";
import TrelloForm from "@/components/TrelloForm";
import { readTrelloFresh, trelloStoreAvailable } from "@/lib/trello-store";

export const dynamic = "force-dynamic";

export default async function TrelloSettings() {
  const current = await readTrelloFresh();

  return (
    <>
      <header>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--gold-ink)]">White Glove admin</p>
            <h1 className="mt-3 font-[family-name:var(--font-display)] text-5xl leading-tight text-[var(--navy)]">
              Trello
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-stone-600">
              When somebody sends in a picture, asks to be listed, reports something wrong or asks about a Pro account,
              a card can appear on your board with a link back to the screen that handles it — so your team can pick
              things up without being given the admin.
            </p>
          </div>
          <Link
            href="/admin/settings"
            className="border border-[var(--gold)] px-4 py-3 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)]"
          >
            Settings
          </Link>
        </div>
      </header>

      <section className="mt-8 rounded-lg border border-[var(--gold-light)] bg-white p-5">
        <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-stone-500">Two things worth knowing first</h2>
        <p className="mt-3 text-sm leading-6 text-stone-600">
          <strong className="font-semibold text-[var(--navy)]">Cards go one way.</strong> Moving a card to Done changes
          nothing here — the site stays the one place a thing is really handled, and nothing is ever read back from
          Trello. Two systems that can both say &ldquo;done&rdquo; end up disagreeing, and then neither can be trusted.
        </p>
        <p className="mt-3 text-sm leading-6 text-stone-600">
          <strong className="font-semibold text-[var(--navy)]">Cards are deliberately thin.</strong> A name, a line, and
          a link. Not the message, not the photograph, not anybody&rsquo;s email address — a board is shared, often
          outside the team, and what somebody sends this site in confidence should not be copied somewhere you cannot
          take it back from.
        </p>
        <p className="mt-3 text-sm leading-6 text-stone-600">
          If Trello is away, or a key is wrong, nothing is lost: the card simply is not made, and the item is on the
          admin screen exactly as before.
        </p>
      </section>

      <section className="mt-8 rounded-lg border border-[var(--gold-light)] bg-[#FAF8F3] p-5">
        <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-stone-500">Where to find the three values</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-stone-600">
          <li>
            Go to{" "}
            <a href="https://trello.com/power-ups/admin" target="_blank" rel="noreferrer" className="underline decoration-[var(--gold)] underline-offset-2">
              trello.com/power-ups/admin
            </a>
            , make a Power-Up for this site, and copy its <strong>API key</strong>.
          </li>
          <li>On the same page, generate a <strong>token</strong> against that key and copy it.</li>
          <li>
            Open your board with <code>.json</code> on the end of the address, search for the name of the list you
            want, and copy the <code>id</code> beside it. That is the <strong>list ID</strong> — a board ID will not
            work.
          </li>
        </ol>
      </section>

      <TrelloForm current={current} storeReady={trelloStoreAvailable()} />
    </>
  );
}
