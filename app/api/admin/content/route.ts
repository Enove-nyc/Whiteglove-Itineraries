import { NextRequest, NextResponse } from "next/server";
import { isValidAccessToken, sameOrigin } from "@/lib/secure-access";
import { deletePromotion, getAdminContent, saveSiteSettings, upsertAccommodation, upsertLocation, upsertLocations, upsertPromotion, reviewSuggestion } from "@/lib/admin-content";
import { applyDirectorySuggestion, applyPlaceSuggestion } from "@/lib/directory-suggestions";
import { reviewProblem, type ReviewDecision } from "@/lib/suggestions";

function isAdmin(request: NextRequest) {
  return isValidAccessToken("admin", request.cookies.get("white_glove_admin")?.value);
}

export async function GET(request: NextRequest) {
  if (!isAdmin(request)) return NextResponse.json({ error: "Please sign in as an administrator." }, { status: 401 });
  return NextResponse.json(await getAdminContent());
}

export async function POST(request: NextRequest) {
  if (!isAdmin(request)) return NextResponse.json({ error: "Please sign in as an administrator." }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "That request did not come from this site." }, { status: 403 });
  const body = await request.json().catch(() => null) as { kind?: string; data?: unknown } | null;
  if (!body?.kind) return NextResponse.json({ error: "Choose what to update." }, { status: 400 });

  if (body.kind === "settings") {
    const saved = await saveSiteSettings((body.data as Record<string, string>) ?? {});
    if (!saved) return NextResponse.json({ error: "The private store could not be reached. Nothing was changed — try again." }, { status: 503 });
  } else if (body.kind === "location") {
    const saved = await upsertLocation(body.data as Parameters<typeof upsertLocation>[0]);
    if (!saved) return NextResponse.json({ error: "The private store could not be reached. Nothing was changed — try again." }, { status: 503 });
  } else if (body.kind === "accommodation") {
    const saved = await upsertAccommodation(body.data as Parameters<typeof upsertAccommodation>[0]);
    if (!saved) return NextResponse.json({ error: "The private store could not be reached. Nothing was changed — try again." }, { status: 503 });
  } else if (body.kind === "locations-bulk") {
    const saved = await upsertLocations(body.data as Parameters<typeof upsertLocations>[0]);
    if (!saved) return NextResponse.json({ error: "The private store could not be reached. Nothing was changed — try again." }, { status: 503 });
  } else if (body.kind === "suggestion") {
    const payload = body.data as { id?: string; status?: ReviewDecision; reviewerNotes?: string; acceptedInfo?: string; apply?: boolean };
    if (!payload?.id || !payload.status) return NextResponse.json({ error: "Choose a suggestion status." }, { status: 400 });
    // The same rule the screen applies, applied again here. The screen can be
    // bypassed; the rule is what stops a rejection with no reason from being
    // stored, and a reason nobody recorded cannot be recovered later.
    const problem = reviewProblem({ status: payload.status, notes: payload.reviewerNotes ?? "" });
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    // Accepting a directory listing WRITES it, then records the decision.
    // Doing it in that order means a failed write leaves the suggestion
    // waiting rather than marked approved with nothing having happened.
    if (payload.status === "approved" && payload.apply) {
      // A place a traveller sent in from the planner publishes as a real
      // listing; anything else is a directory submission. Try the place path
      // first and fall through to the directory path when it is not one.
      const place = await applyPlaceSuggestion(payload.id);
      if (place === "missing") return NextResponse.json({ error: "That suggestion is no longer there." }, { status: 404 });
      if (place === false) return NextResponse.json({ error: "The listing could not be published, so nothing was accepted. Try again." }, { status: 503 });
      if (place === "not-a-place") {
        const applied = await applyDirectorySuggestion(payload.id);
        if (applied === "missing") return NextResponse.json({ error: "That suggestion is no longer there." }, { status: 404 });
        if (applied === "not-a-listing") return NextResponse.json({ error: "That suggestion has no listing to apply." }, { status: 400 });
        if (!applied) return NextResponse.json({ error: "The listing could not be saved, so nothing was accepted. Try again." }, { status: 503 });
      }
    }
    const saved = await reviewSuggestion(payload.id, {
      status: payload.status,
      notes: payload.reviewerNotes ?? "",
      acceptedInfo: payload.acceptedInfo ?? "",
    });
    if (saved === "missing") return NextResponse.json({ error: "That suggestion is no longer there." }, { status: 404 });
    if (!saved) return NextResponse.json({ error: "The private store could not be reached. Nothing was changed — try again." }, { status: 503 });
  } else if (body.kind === "promotion") {
    const saved = await upsertPromotion(body.data as Parameters<typeof upsertPromotion>[0]);
    if (!saved) return NextResponse.json({ error: "The private store could not be reached. Nothing was changed — try again." }, { status: 503 });
  } else if (body.kind === "promotion-delete") {
    // This branch did not exist. The Delete button on the advertisements
    // screen has always sent "promotion-delete", so it fell through to
    // "Unsupported update type" below — an advertisement could be created and
    // never removed, and deletePromotion() sat in lib/admin-content.ts with no
    // caller at all. Nothing was wrong with the button or the storage; the two
    // were simply never joined up.
    const id = (body.data as { id?: string } | undefined)?.id;
    if (!id) return NextResponse.json({ error: "Which advertisement?" }, { status: 400 });
    const saved = await deletePromotion(id);
    if (!saved) return NextResponse.json({ error: "The private store could not be reached. Nothing was changed — try again." }, { status: 503 });
  } else {
    return NextResponse.json({ error: "Unsupported update type." }, { status: 400 });
  }

  return NextResponse.json(await getAdminContent());
}
