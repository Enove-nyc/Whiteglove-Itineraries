import Link from "next/link";
import { readWords } from "@/lib/site-words-store";
import { pageMetadata } from "@/lib/seo";
import ContactForm from "@/components/ContactForm";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import PageBlocks from "@/components/PageBlocks";
import { readReasonForBrand, reasonsForBrand } from "@/lib/contact-reasons";
import { resolvePage } from "@/lib/pages";
import { currentBrand } from "@/lib/site-brand";
import { BRAND_NAME } from "@/lib/site-brand-core";
import { contactEmailFor } from "@/lib/site-words";

export async function generateMetadata() {
  const [page, name] = await Promise.all([resolvePage("contact"), currentBrand().then((b) => BRAND_NAME[b])]);
  // The owner writes the title and description in the admin; the
  // canonical URL and the share card come from the page it is.
  //
  // ONLY WHEN HE HAS ACTUALLY EDITED IT. resolvePage hands back the built-in
  // page when he has not, and the built-in title names White Glove Kosher
  // Travel — so reading it unconditionally put the other brand's name in the
  // tab, the search result and the link preview of every page on this site.
  const edited = page?.edited ? page : null;
  const errands =
    name === BRAND_NAME.itineraries
      ? "Tell us something on the site is broken, or ask a question."
      : "Tell us something on the site is wrong, ask about advertising, or ask a question.";
  return pageMetadata({
    title: edited?.seoTitle ?? `Contact — ${name}`,
    description: edited?.seoDescription ?? errands,
    path: "/contact",
  });
}

/**
 * Three errands, and only the questions that belong to the one you picked.
 *
 * Somebody writing to say a shul's address had changed used to meet the same
 * open message box as somebody asking about advertising, and both wrote in it
 * instead of the field the form should have asked for — which cost a reply
 * asking for the one fact that was missing.
 *
 * THE REASONS ARE LINKS, NOT A JAVASCRIPT TOGGLE. Three things follow, and all
 * three matter more than the extra render: /contact?reason=advertise can be
 * linked to from the footer and from an advertising page, the choice survives
 * a refresh and a shared address, and the page works with scripts blocked.
 */
export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; from?: string }>;
}) {
  const { reason: reasonParam } = await searchParams;
  const [page, words, brand] = await Promise.all([resolvePage("contact"), readWords(), currentBrand()]);
  const reason = readReasonForBrand(reasonParam, brand);
  const reasons = reasonsForBrand(brand);
  const contactEmail = contactEmailFor(brand, words);

  return (
    <main className="min-h-screen bg-[var(--cream)]">
      <Navbar />
      <PageBlocks blocks={page!.blocks} />

      <section className="mx-auto max-w-5xl px-5 pb-16 sm:px-8">
        <h2 className="max-w-2xl font-[family-name:var(--font-display)] text-3xl leading-tight text-[var(--navy)] sm:text-4xl">
          Reason for writing
        </h2>
        <ul className="mt-8 grid gap-3 sm:grid-cols-2">
          {reasons.map((entry) => {
            const chosen = entry.value === reason;
            return (
              <li key={entry.value}>
                <Link
                  href={`/contact?reason=${entry.value}`}
                  aria-current={chosen ? "true" : undefined}
                  scroll={false}
                  className={`flex h-full min-h-11 flex-col justify-center rounded-xl border p-5 transition ${
                    chosen
                      ? "border-[var(--navy)] bg-[var(--navy)] text-white"
                      : "border-[var(--gold-light)] bg-[var(--surface)] hover:border-[var(--gold)]"
                  }`}
                >
                  <span
                    className={`font-[family-name:var(--font-display)] text-xl leading-tight ${
                      chosen ? "text-white" : "text-[var(--navy)]"
                    }`}
                  >
                    {entry.label}
                  </span>
                  <span className={`mt-1 text-sm leading-6 ${chosen ? "text-slate-200" : "text-stone-600"}`}>
                    {entry.blurb}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="mt-10">
          {reason === "" ? (
            // Not a form and not an apology: the four above are the page, and
            // the address is here for somebody who would rather just write.
            <p className="rounded-xl border border-[var(--gold-light)] bg-[var(--surface)] p-6 leading-7 text-stone-600">
              Or write to us at{" "}
              <a
                href={`mailto:${contactEmail}`}
                className="font-semibold text-[var(--navy)] underline decoration-[var(--gold)] decoration-2 underline-offset-4"
              >
                {contactEmail}
              </a>
              . {words.replyPromise}
            </p>
          ) : (
            <ContactForm reason={reason} words={{ ...words, contactEmail }} />
          )}
        </div>
      </section>

      <Footer />
    </main>
  );
}
