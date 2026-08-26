import { NextRequest, NextResponse } from "next/server";
import { rateLimit, requesterKey, tooManyMessage } from "@/lib/rate-limit";
import { readMessage } from "@/lib/contact-messages";
import { saveContactMessage } from "@/lib/contact-store";
import { sendContactMessage } from "@/lib/email";
import { cardIfWanted } from "@/lib/trello-store";
import { readReason } from "@/lib/contact-reasons";
import { fileFaultIssue } from "@/lib/github-issues";
import { siteOrigin } from "@/lib/seo";
import { currentBrand } from "@/lib/site-brand";

export const dynamic = "force-dynamic";

/**
 * Everything anybody writes on this website arrives here.
 *
 * Three forms — the contact page, the trip enquiry, the flight booking request
 * — and one queue, because to the person answering them they are one job.
 *
 * IT USED TO BE AN EMAIL AND NOTHING ELSE. The message was handed to Resend and
 * written down nowhere, so a mail service that was away, or an address that had
 * stopped working, meant the visitor was told "we couldn't send your message"
 * and their words were gone: not delayed, not queued, gone. Somebody asking to
 * have a trip planned is the most valuable thing this site receives, and it was
 * the one thing the site did not keep.
 *
 * SAVED FIRST, EMAILED SECOND. Once the message is in the queue it is safe: the
 * admin dashboard counts it and the messages screen holds every word of it, so
 * the email is a convenience — a nudge to a phone — and IS NOT AWAITED. An
 * email service that is slow or away must not turn a saved message into an
 * error the person sees, because they would write it again, and again.
 *
 * WHEN NOTHING SAVED IT, THE EMAIL IS THE ONLY COPY, so it is awaited and its
 * failure is the visitor's failure — which is exactly what this route did
 * before, and is now what it does only in the case that genuinely calls for it.
 * A message is received when it is somewhere it can be found again; only when
 * it is in neither place is anybody asked to try again.
 */
export async function POST(request: NextRequest) {
  // Every accepted message saves a record, sends mail, opens a Trello card, and
  // for a fault report opens a public GitHub issue. Unthrottled, that is a way
  // to spam the repo and the inbox and to evict real waiting messages from the
  // queue's cap. Gate by who is asking, before any of it happens — the sibling
  // alerts route does the same.
  const gate = await rateLimit(`contact:${requesterKey(request.headers)}`, { limit: 8, windowSeconds: 60 * 60 });
  if (!gate.ok) return NextResponse.json({ error: tooManyMessage(gate.retryAfter) }, { status: 429, headers: { "Retry-After": String(gate.retryAfter) } });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const read = readMessage(body ?? {});
  if ("problem" in read) return NextResponse.json({ error: read.problem }, { status: 400 });
  const fields = read.fields;
  // Which company's contact@ this lands in — see sendContactMessage.
  const withBrand = { ...fields, siteBrand: await currentBrand() };

  const saved = await saveContactMessage(fields);
  if (saved) {
    // Not awaited: it is already safe. A failure here is logged by lib/email
    // and shows on the connections screen, and the message is answered from
    // the admin either way.
    void sendContactMessage(withBrand).catch(() => {});
  } else {
    // No private store, or it could not be reached. The email is the only copy
    // there will ever be of this message, so it is waited for and its failure
    // is the visitor's.
    const sent = await sendContactMessage(withBrand);
    if (!sent) {
      return NextResponse.json(
        { error: "We couldn't send your message just now. Please email us directly or try again shortly." },
        { status: 503 },
      );
    }
  }

  // EVERY MESSAGE RAISES A CARD. Which one, and therefore whose it is, comes
  // from the reason they picked — read through readReason rather than trusted,
  // because this is a public endpoint and the body is whatever was posted.
  //
  // A fault is the only reason that is a claim about the SITE rather than
  // about the world, so it is the only one that goes to the bot and the only
  // one that opens an issue. Everything else is a person waiting on a person.
  const reason = readReason(typeof body?.reason === "string" ? body.reason : undefined);
  const fault = reason === "fault";
  void cardIfWanted({
    kind: fault ? "fault" : "contact",
    about: fields.subject || fields.name,
    siteUrl: siteOrigin()?.toString(),
  });
  if (fault) {
    // Not awaited, like the card: a visitor who reported a broken button is
    // not made to wait on GitHub, and GitHub being away must not turn their
    // report into an error page.
    void fileFaultIssue({
      page: firstLine(fields.message, /^Which page:\s*(.*)$/im),
      what: fields.message,
      device: firstLine(fields.message, /^Phone or computer:\s*(.*)$/im),
    });
  }

  return NextResponse.json({ ok: true });
}

/**
 * Pull one of the reason's answers back out of the composed message.
 *
 * composeMessage (lib/contact-reasons.ts) puts the extra answers above what
 * was typed, as "Label: value" lines. Reading them back here rather than
 * asking the browser to send them twice keeps one shape of request and one
 * place where the message is assembled — and the form and this regex are
 * matched by tests/contact-reasons.test.ts.
 */
function firstLine(message: string, pattern: RegExp): string {
  return (pattern.exec(message)?.[1] ?? "").trim();
}
