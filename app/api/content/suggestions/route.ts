import { NextRequest, NextResponse } from "next/server";
import { addSuggestion, type SubmittedPlace } from "@/lib/admin-content";
import { cleanDraft, consentFromSubmission, draftProblems, type DirectoryDraft, type SubmitterConsent } from "@/lib/directory-fields";
import { sendSubmissionNotification } from "@/lib/email";
import { siteOrigin } from "@/lib/seo";
import { cardIfWanted } from "@/lib/trello-store";

const KIND_LABEL: Record<string, string> = {
  location: "Edit suggestion",
  accommodation: "Accommodation suggestion",
  site: "Site suggestion",
  directory: "Business listing",
  new: "New entry request",
};

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as {
    targetType?: "location" | "accommodation" | "site" | "directory" | "new";
    targetId?: string;
    title?: string;
    name?: string;
    email?: string;
    issue?: string;
    currentInfo?: string;
    suggestedInfo?: string;
    source?: string;
    /** A directory listing, field by field, from the same form the owner uses. */
    draft?: DirectoryDraft;
    /** A place lifted from a traveller's itinerary — the planner "send it in" path. */
    place?: SubmittedPlace;
    consent?: SubmitterConsent;
  } | null;
  if (!body?.targetType || !body.targetId || !body.title || !body.name || !body.email || !body.issue || !body.suggestedInfo) {
    return NextResponse.json({ error: "Complete the suggestion form." }, { status: 400 });
  }

  // A structured directory listing is checked here as well as in the browser,
  // because the browser's copy can be skipped. Only known fields survive.
  const draft = body.draft ? cleanDraft(body.draft) : undefined;
  if (draft) {
    const problems = draftProblems(draft);
    if (problems.length) return NextResponse.json({ error: problems[0] }, { status: 400 });
  }

  // A place sent in from the planner, kept to only its known fields — the same
  // reason the draft is cleaned above: the browser's copy can be skipped, and
  // free text under an unknown key must never reach the store.
  const place = cleanSubmittedPlace(body.place);

  // Consent counts only when the submitter says the business is theirs AND
  // says the number may be published. Anything else is no consent, which is
  // what lib/provider-contact.ts then acts on.
  const consent = consentFromSubmission(
    body.consent ?? {},
    { name: body.name, email: body.email },
    new Date().toISOString().slice(0, 10),
  );

  // Email the owner and save to the dashboard in parallel. As long as one of
  // them succeeds the submission is not lost, so a visitor's message still
  // reaches the owner even when the database is not connected.
  const [emailed, saved] = await Promise.all([
    sendSubmissionNotification({
      kind: KIND_LABEL[body.targetType] ?? "Submission",
      targetType: body.targetType,
      targetId: body.targetId,
      title: body.title,
      name: body.name,
      email: body.email,
      issue: body.issue,
      currentInfo: body.currentInfo ?? "",
      suggestedInfo: body.suggestedInfo,
      source: body.source ?? "",
    }),
    addSuggestion({
      targetType: body.targetType,
      targetId: body.targetId,
      title: body.title,
      name: body.name,
      email: body.email,
      issue: body.issue,
      currentInfo: body.currentInfo ?? "",
      suggestedInfo: body.suggestedInfo,
      source: body.source ?? "",
      draft,
      place,
      ...consent,
    }),
  ]);

  // A card on the board, for an owner who works from one. Not awaited and
  // never able to fail the submission: a correction somebody bothered to send
  // must not be lost to Trello being away.
  void cardIfWanted({
    // A directory entry is a business asking to be listed; everything else is
    // somebody correcting a page.
    kind: body.targetType === "directory" ? "listing" : "suggestion",
    about: body.title,
    siteUrl: siteOrigin()?.toString(),
  });

  if (!emailed && !saved) {
    return NextResponse.json({ error: "We couldn't record your submission just now. Please try again shortly." }, { status: 503 });
  }
  return NextResponse.json({ ok: true });
}

/**
 * Keep a sent-in place to only its known fields, or drop it entirely.
 *
 * A whitelist, not a trim: an unknown key never survives, and a place with no
 * name or with a kind that is not "stop"/"stay" is not a place we can publish,
 * so it is discarded rather than stored half-formed.
 */
function cleanSubmittedPlace(raw: unknown): SubmittedPlace | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const p = raw as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const name = str(p.name);
  const kind = p.kind === "stay" ? "stay" : p.kind === "stop" ? "stop" : undefined;
  if (!name || !kind) return undefined;
  return {
    kind,
    name,
    address: str(p.address),
    coordinates: str(p.coordinates),
    country: str(p.country),
    href: str(p.href),
    phone: str(p.phone),
  };
}

export async function GET() {
  return NextResponse.json({ error: "Method not allowed." }, { status: 405 });
}
