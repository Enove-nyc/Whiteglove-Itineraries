import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { sameOrigin } from "@/lib/secure-access";
import { mayBrandOwnItinerary } from "@/lib/account-limits";
import { PLAN_LABELS } from "@/lib/account-plans";
import { getPlan } from "@/lib/account-plan-store";
import { accountCookieName, getCurrentAccountData } from "@/lib/account-store";
import { brandProblem, cleanBrand, describeBrand, emptyBrand, printBrandFor } from "@/lib/business-brand";
import { brandStoreAvailable, readBrand, writeBrand } from "@/lib/business-brand-store";
import { effectiveMediaLimit, isAllowedMediaType, mediaStoreAvailable, putMedia } from "@/lib/media";

export const dynamic = "force-dynamic";

/**
 * An Advisor Pro account's own letterhead.
 *
 * GET is what the print pages ask before they draw, so it answers for anybody
 * signed in and simply says `brand: null` when there is nothing to use — a
 * traveller, a Starter account, an Advisor Pro account that has not turned it
 * on. The print page then renders the White Glove document, which is what it
 * did before any of this existed.
 *
 * POST is the only way in, and it checks the plan every single time. The panel
 * on the account page is hidden for anybody who cannot use this, but a hidden
 * form is not a closed door — somebody whose Advisor Pro subscription lapsed
 * still has the address of this route in their history.
 *
 * A LOGO IS NOT DELETED WHEN A PLAN LAPSES. The record stays exactly as it is
 * and `printBrandFor` refuses to use it. If they come back, their letterhead is
 * where they left it; nothing of theirs was thrown away because a card expired.
 */

const MAX_LOGO_BYTES = effectiveMediaLimit();

/**
 * Only these three.
 *
 * A PDF is a valid upload elsewhere on this site and is not a logo. SVG is
 * deliberately refused even though it is the format a designer would hand over:
 * /api/media serves an uploaded file from this site's own origin with the
 * content type it was given, and an SVG is a document that can carry script. A
 * logo upload is the one place on this site where a signed-in stranger chooses
 * the bytes, so it gets raster formats only.
 */
const LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

async function whoAndPlan(cookie: string | undefined) {
  const account = await getCurrentAccountData(cookie);
  if (!account) return null;
  const plan = await getPlan(account.email);
  return { account, plan, allowed: mayBrandOwnItinerary(plan) };
}

export async function GET() {
  const cookieStore = await cookies();
  const who = await whoAndPlan(cookieStore.get(accountCookieName())?.value);
  if (!who) return NextResponse.json({ signedIn: false, allowed: false, brand: null, print: null });

  const stored = await readBrand(who.account.email);
  return NextResponse.json({
    signedIn: true,
    allowed: who.allowed,
    plan: who.plan,
    storeReady: brandStoreAvailable(),
    brand: stored ?? emptyBrand(who.account.email),
    /** What the printed document should actually use. Null means White Glove. */
    print: printBrandFor(stored, who.allowed),
    summary: describeBrand(stored, who.allowed),
  });
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "That request did not come from this site." }, { status: 403 });
  const cookieStore = await cookies();
  const who = await whoAndPlan(cookieStore.get(accountCookieName())?.value);
  if (!who) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!who.allowed) {
    return NextResponse.json(
      { error: `Putting your own name on an itinerary is part of ${PLAN_LABELS.pro}.` },
      { status: 403 },
    );
  }
  if (!brandStoreAvailable()) {
    return NextResponse.json({ error: "This cannot be saved just now. Try again shortly." }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as {
    name?: string;
    contactLine?: string;
    enabled?: boolean;
    /** A new logo, as a data URL from the file picker. Absent means keep the one on file. */
    logoDataUrl?: string;
    /** True to go back to no logo at all — a name-only letterhead. */
    removeLogo?: boolean;
  } | null;
  if (!body) return NextResponse.json({ error: "Nothing was sent." }, { status: 400 });

  const problem = brandProblem(body);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const existing = await readBrand(who.account.email);
  let logoMediaId = existing?.logoMediaId ?? "";

  if (body.removeLogo) logoMediaId = "";

  if (body.logoDataUrl?.startsWith("data:")) {
    if (!mediaStoreAvailable()) {
      return NextResponse.json({ error: "Pictures cannot be stored just now. Save the name and add the logo later." }, { status: 503 });
    }
    // `[\s\S]` rather than the dotAll flag: the project targets an older
    // library than `s` requires, and this is the same match.
    const match = /^data:([^;,]+);base64,([\s\S]+)$/.exec(body.logoDataUrl);
    if (!match) return NextResponse.json({ error: "That file could not be read." }, { status: 400 });
    const [, contentType, base64] = match;
    if (!LOGO_TYPES.has(contentType) || !isAllowedMediaType(contentType)) {
      return NextResponse.json({ error: "Use a PNG, JPG or WEBP picture." }, { status: 400 });
    }
    // base64 is about 4 bytes for every 3, so this is the real file size.
    const bytes = Math.floor((base64.length * 3) / 4);
    if (bytes > MAX_LOGO_BYTES) {
      return NextResponse.json(
        { error: `That picture is ${Math.round(bytes / 1024)}KB. Keep a logo under ${Math.round(MAX_LOGO_BYTES / 1024)}KB.` },
        { status: 400 },
      );
    }
    const id = await putMedia(contentType, base64);
    if (!id) return NextResponse.json({ error: "That picture could not be stored. Try again." }, { status: 503 });
    logoMediaId = id;
  }

  const next = cleanBrand(who.account.email, {
    name: body.name,
    contactLine: body.contactLine,
    enabled: body.enabled === true,
    logoMediaId,
  });
  if (!(await writeBrand(who.account.email, next))) {
    return NextResponse.json({ error: "That could not be saved. Try again." }, { status: 503 });
  }
  return NextResponse.json({
    ok: true,
    brand: next,
    print: printBrandFor(next, true),
    summary: describeBrand(next, true),
  });
}
