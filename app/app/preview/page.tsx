import Link from "next/link";
import CompanionApp from "@/components/companion/CompanionApp";
import { COMPANION_DEMO_TRIP } from "@/data/companion-demo";
import { pageMetadata } from "@/lib/seo";
import { currentBrand } from "@/lib/site-brand";

/**
 * The client app, shown to somebody who has not bought it.
 *
 * WHAT WAS WRONG WITH /app. A buyer who clicked "the app" — the thing three
 * plans are sold on — arrived at a code field and a login button. Both doors
 * are for people who already have it. The product itself, which is the whole
 * promise, was invisible to everybody deciding whether to pay for it, and two
 * separate audits said the same thing about it in the same week.
 *
 * A demo trip was already in the repository and already the component's own
 * default, used for nothing. It is a made-up family in Rome with a made-up
 * advisor, written in the site's voice with real, publishable Rome information
 * — which is the right kind of sample, because a buyer can judge the quality of
 * what a client would actually read.
 *
 * IT SAYS SO ABOVE THE FOLD, IN WORDS. Every one of these screens is a picture
 * of somebody's private trip, and a demo that does not announce itself invites
 * exactly the wrong reading — that these are real people, or worse that
 * somebody's real trip is on a public page. The banner is not a footnote.
 *
 * NOT INDEXED. There is one page that should rank for the app and it is /app,
 * where the product is explained and sold. A second page carrying the same
 * subject and none of the explanation would compete with it.
 */
export async function generateMetadata() {
  const brand = await currentBrand();
  return pageMetadata({
    title: brand === "itineraries" ? "A sample client trip — White Glove Itineraries" : "A sample client trip",
    description:
      "What a traveller opens when their advisor sends them the app — a day at a time, with the wallet on the phone. A made-up trip, shown in full.",
    path: "/app/preview",
    noIndex: true,
  });
}

export default function AppPreviewPage() {
  return (
    <main>
      {/* Above the app, not over it: the app below fills the screen and owns
          every pixel of it, so a floating notice would cover a control. */}
      <div className="border-b border-[var(--gold)]/30 bg-[var(--cream)] px-5 py-4 sm:px-8">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <p className="text-sm leading-6 text-stone-700">
            <span className="font-bold uppercase tracking-[0.14em] text-[var(--gold-ink)]">Sample</span>{" "}
            — a made-up family, a made-up advisor, a real week in Rome. This is what your client opens when
            you send them the app.
          </p>
          <Link
            href="/app"
            className="inline-flex min-h-11 items-center rounded-full border border-[var(--navy)] px-5 text-sm font-semibold text-[var(--navy)] transition hover:bg-[var(--navy)] hover:text-white"
          >
            Back to the app
          </Link>
        </div>
      </div>

      {/* THE DEMO TRIP, SHOWN AS A CLIENT GETS IT. The component's own default
          is this same object; what the page adds is `previewAsClient`, which
          takes away the three controls no client will ever have — the
          Concierge tab, the Concierge/Guide switch and the Traveler/Advisor
          switch. They demonstrate a concierge tier that is not built, and on
          the one page that promises "this is what your client opens" they were
          a feature being shown to somebody who could not buy it. The scripted
          advisor thread stays; it just sits where a client's thread sits.

          No advisorInbox either — this is the client's side, the side sold. */}
      <CompanionApp trip={{ ...COMPANION_DEMO_TRIP, previewAsClient: true }} />
    </main>
  );
}
