import Link from "next/link";
import AboutProfileSection from "@/components/AboutProfileSection";
import CaseStudiesSection from "@/components/CaseStudiesSection";
import Footer from "@/components/Footer";
import GloveMark from "@/components/GloveMark";
import Navbar from "@/components/Navbar";
import PageBlocks from "@/components/PageBlocks";
import StartingPoints from "@/components/StartingPoints";
import { pageMetadata } from "@/lib/seo";
import { resolvePage } from "@/lib/pages";
import { readAboutProfile } from "@/lib/about-profile-store";
import { readPublicCaseStudies } from "@/lib/case-studies-store";
import { readWords } from "@/lib/site-words-store";
import { currentBrand } from "@/lib/site-brand";
import { BRAND_NAME } from "@/lib/site-brand-core";
import { contactEmailFor } from "@/lib/site-words";

export async function generateMetadata() {
  const [page, name] = await Promise.all([resolvePage("about"), currentBrand().then((b) => BRAND_NAME[b])]);
  // ONLY WHEN HE HAS ACTUALLY EDITED IT — the same trap /contact fell into.
  // resolvePage hands back the BUILT-IN page when the owner has not written
  // one, and that page's seoTitle reads "About White Glove Kosher Travel — who
  // we are and how we work". Read unconditionally, it put the other brand in
  // this page's tab, its search result, its share card and — because
  // pageMetadata settles og:site_name from whichever brand the title names —
  // in the site name on the card too. The body of the page had been saying
  // Itineraries for a while; the head went on saying Kosher Travel.
  const edited = page?.edited ? page : null;
  return pageMetadata({
    title: edited?.seoTitle ?? `About — ${name}`,
    description:
      edited?.seoDescription ??
      `Who is behind ${name}, how the practical detail on this site is put together, and how to reach a person.`,
    path: "/about",
  });
}

/**
 * Who is behind this.
 *
 * Personal facts come from /admin/settings/about (never invented). Case studies
 * from /admin/settings/proof appear only when complete, permitted and approved.
 * The process blocks below stay editable via /admin/pages.
 */
export default async function AboutPage() {
  const [page, words, profile, studies, siteBrand] = await Promise.all([
    resolvePage("about"),
    readWords(),
    readAboutProfile(),
    readPublicCaseStudies(),
    currentBrand(),
  ]);

  // Hero is rendered by AboutProfileSection so empty personal fields can hide
  // cleanly; skip a duplicate hero block from the page editor.
  const blocks = (page?.blocks ?? []).filter((block) => !(block.kind === "hero" && block.id === "about-hero"));

  return (
    <main className="min-h-screen bg-[var(--cream)] text-[var(--ink)]">
      <Navbar />
      <AboutProfileSection profile={profile} siteBrand={siteBrand} />
      <PageBlocks blocks={blocks} />
      <CaseStudiesSection studies={studies} />

      <section className="mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-16">
        <div className="rounded-2xl border border-[var(--navy)] bg-[var(--navy)] p-6 text-white sm:p-9">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <GloveMark size="lg" />
            <h2 className="font-[family-name:var(--font-display)] text-3xl leading-tight sm:text-4xl">
              Talk to a person
            </h2>
          </div>
          <p className="mt-4 max-w-2xl leading-7 text-slate-200">
            {siteBrand === "itineraries"
              ? "Ask about a plan, tell us something on the site is broken, or ask a question."
              : "Write about a trip, tell us something on the site is wrong, or ask a question about a destination."}{" "}
            {words.replyPromise}
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link
              href="/contact"
              className="inline-flex min-h-11 items-center rounded-md bg-[var(--gold)] px-6 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy-deep)] transition hover:bg-[var(--gold-light)]"
            >
              Open the contact form
            </Link>
            <a
              href={`mailto:${contactEmailFor(siteBrand, words)}`}
              className="inline-flex min-h-11 items-center rounded-md border border-white/30 px-6 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:border-[var(--gold-light)] hover:text-[var(--gold-light)]"
            >
              {contactEmailFor(siteBrand, words)}
            </a>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-16 sm:px-8">
        <StartingPoints heading="Where to start" />
      </section>

      <Footer />
    </main>
  );
}
