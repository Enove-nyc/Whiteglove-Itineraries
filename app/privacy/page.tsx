import { readWords } from "@/lib/site-words-store";
import { pageMetadata } from "@/lib/seo";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import PageBlocks from "@/components/PageBlocks";
import { resolvePage } from "@/lib/pages";
import { contactEmailFor } from "@/lib/site-words";
import { BRAND_DOMAIN, BRAND_NAME } from "@/lib/site-brand-core";
import { currentBrand } from "@/lib/site-brand";

// See app/terms/page.tsx for why this is rendered per request rather than
// prerendered: which brand this policy names depends on which domain a
// visitor is actually on, and a single static page cannot answer that.
export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const name = BRAND_NAME[await currentBrand()];
  return pageMetadata({
    title: `Privacy Policy — ${name}`,
    description: `How ${name} collects, uses, and protects your information.`,
    path: "/privacy",
  });
}

const UPDATED = "July 26, 2026";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10 first:mt-0">
      <h2 className="font-[family-name:var(--font-display)] text-3xl leading-tight text-[var(--navy)]">{title}</h2>
      <div className="mt-4 space-y-4 text-[15px] leading-7 text-stone-600">{children}</div>
    </section>
  );
}

export default async function PrivacyPolicyPage() {
  // The owner's published blocks once he has edited this page; the built-in
  // version — still wired to the site words for the contact email — until then.
  const page = await resolvePage("privacy");
  if (page?.edited) {
    return (
      <main className="min-h-screen bg-[var(--cream)]">
        <Navbar />
        <PageBlocks blocks={page.blocks} />
        <Footer />
      </main>
    );
  }
  const [words, brand] = await Promise.all([readWords(), currentBrand()]);
  const contactEmail = contactEmailFor(brand, words);
  const itineraries = brand === "itineraries";
  const siteName = BRAND_NAME[brand];
  const siteDomain = BRAND_DOMAIN[brand];
  return (
    <main className="min-h-screen bg-[var(--cream)]">
      <Navbar />
      <section className="wg-page-hero border-b border-[var(--gold-light)] px-5 py-14 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[0.26em] text-[var(--gold-ink)]">{siteName}</p>
          <h1 className="mt-5 font-[family-name:var(--font-display)] text-4xl leading-tight text-[var(--navy)] sm:text-5xl">Privacy Policy</h1>
          <p className="mt-4 text-sm text-stone-500">Last updated: {UPDATED}</p>
        </div>
      </section>

      <article className="wg-prose mx-auto max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
        <p className="text-[15px] leading-7 text-stone-600">
          {siteName} (&ldquo;we,&rdquo; &ldquo;us&rdquo;), operated by White Glove Travel, LLC, provides{" "}
          {itineraries ? "trip-planning tools" : "travel guides and planning tools for kosher travel and Jewish heritage journeys"} at{" "}
          {siteDomain}. This policy explains what information we collect, how we use it, and the choices you have.
        </p>

        <Section title="Information we collect">
          <p>We collect only what we need to run the service:</p>
          <ul className="glove-list space-y-2">
            <li><strong className="text-[var(--navy)]">Account details</strong> — your email address and a password. Passwords are stored only in a hashed form; we never store or see your plain password.</li>
            <li><strong className="text-[var(--navy)]">Content you save</strong> — the destinations, routes, and favorites you add to your account.</li>
            <li><strong className="text-[var(--navy)]">Searches and trip details</strong> — the cities, flights, and hotels you search for, so we can show relevant results and tools.</li>
            <li><strong className="text-[var(--navy)]">Usage analytics</strong> — aggregate counts such as page visits and popular search terms. These are totals and are not linked to your identity.</li>
            <li><strong className="text-[var(--navy)]">Cookies</strong> — a sign-in cookie that keeps you logged in, and, where enabled, a site-access cookie. We do not use advertising cookies.</li>
          </ul>
        </Section>

        <Section title="How we use your information">
          <ul className="glove-list space-y-2">
            <li>To create and secure your account and keep you signed in.</li>
            <li>To send account emails — verification codes and password-reset codes.</li>
            <li>To provide planning features such as saved routes, favorites, and flight and hotel search.</li>
            <li>To understand which guides and searches are most useful, so we can improve the site.</li>
          </ul>
        </Section>

        <Section title="Service providers we share with">
          <p>We use a small number of trusted providers to operate the service. We share only what each needs to do its job, and we do not sell your personal information.</p>
          <ul className="glove-list space-y-2">
            <li><strong className="text-[var(--navy)]">Email delivery</strong> — to send verification and password-reset messages.</li>
            <li><strong className="text-[var(--navy)]">Flight and hotel search</strong> — a travel-technology partner processes your travel searches and any booking you choose to make.</li>
            <li><strong className="text-[var(--navy)]">Hosting and data storage</strong> — our website host and database provider store the data described above securely on our behalf.</li>
          </ul>
        </Section>

        <Section title="How long we keep it">
          <p>We keep your account information for as long as your account is active. Verification and reset codes are short-lived and expire automatically. You can ask us to delete your account and its data at any time using the contact details below.</p>
        </Section>

        <Section title="Security">
          <p>We protect your information with industry-standard measures: passwords are salted and hashed, sign-in sessions and account codes are cryptographically signed and time-limited, and traffic is served over encrypted connections. No online service can be perfectly secure, but we work to keep your information safe.</p>
        </Section>

        <Section title="Your choices">
          <p>You can review and update your saved content from your account at any time. To access, correct, export, or delete your personal information, email us and we will help. You can also unsubscribe from non-essential emails; account and security emails are required to use the service.</p>
        </Section>

        <Section title="Children">
          <p>White Glove is intended for adults planning travel and is not directed to children. We do not knowingly collect information from children.</p>
        </Section>

        <Section title="Changes to this policy">
          <p>We may update this policy from time to time. When we do, we will revise the &ldquo;Last updated&rdquo; date above. Significant changes will be noted on this page.</p>
        </Section>

        <Section title="Contact us">
          <p>
            Questions about this policy or your information? Email{" "}
            <a href={`mailto:${contactEmail}`} className="font-semibold text-[var(--navy)] underline decoration-[var(--gold)] decoration-2 underline-offset-4">{contactEmail}</a>.
          </p>
        </Section>
      </article>
      <Footer />
    </main>
  );
}
