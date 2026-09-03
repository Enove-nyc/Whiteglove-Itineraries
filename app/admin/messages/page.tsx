import Link from "next/link";
import ContactMessages from "@/components/ContactMessages";
import { contactStoreAvailable, listContactMessages } from "@/lib/contact-store";
import { emailConfigStatus } from "@/lib/email";

export const dynamic = "force-dynamic";

/**
 * Everything anybody has written in from the website.
 *
 * There was no screen for this at all. A message was emailed and stored
 * nowhere, so the admin could not tell you whether anybody had written in this
 * month, and with no email service connected the answer was that nobody could.
 */
export default async function AdminMessagesPage() {
  const available = contactStoreAvailable();
  const [messages, email] = await Promise.all([
    available ? listContactMessages() : Promise.resolve([]),
    emailConfigStatus(),
  ]);
  // Read once on the server, so "6 days ago" is worked out in one place.
  const now = new Date().toISOString();

  return (
    <>
      <header>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--gold-ink)]">White Glove admin</p>
            <h1 className="mt-3 font-[family-name:var(--font-display)] text-5xl leading-tight text-[var(--navy)]">
              Messages
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-stone-600">
              What people write on the contact page, the trip enquiry and the flight booking request. They are kept
              here whether or not the email arrives, so nothing anybody writes is lost to a mail service being away.
            </p>
          </div>
          <Link
            href="/admin"
            className="border border-[var(--gold)] px-4 py-3 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)]"
          >
            Dashboard
          </Link>
        </div>
      </header>

      <section className="mt-8">
        {!available ? (
          <div className="border border-[var(--gold-light)] bg-[#FAF8F3] p-8">
            <p className="text-sm leading-7 text-stone-600">
              The private store isn&apos;t connected, so messages are not being kept — each one is emailed and nothing
              more, and if the email fails the person is asked to try again.
            </p>
            <Link
              href="/admin/settings/connections"
              className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-4"
            >
              Review connections →
            </Link>
          </div>
        ) : (
          <>
            {/* The queue is the backstop for the email, so it is worth saying
                on this screen when the email half is not working — otherwise
                somebody reads the list and assumes his inbox has them too. */}
            {!email.apiKeySet && (
              <div className="mb-6 border border-amber-200 bg-amber-50 p-5">
                <p className="text-sm leading-6 text-amber-950">
                  No email service is connected, so nothing below was sent to your inbox. Every message is still kept
                  here — this screen is the only place they are.
                </p>
              </div>
            )}
            <ContactMessages messages={messages} now={now} />
          </>
        )}
      </section>
    </>
  );
}
