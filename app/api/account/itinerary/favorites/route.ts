import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { sameOrigin } from "@/lib/secure-access";
import {
  accountCookieName,
  getAccountRecord,
  getShareOwnerEmail,
  readSessionEmail,
  tripAccessFor,
} from "@/lib/account-store";
import { favoriteProblem, type SharedFavorite } from "@/lib/trip-collaboration";
import {
  addSharedFavorite,
  favoritesStoreAvailable,
  readSharedFavorites,
  removeSharedFavorite,
} from "@/lib/trip-favorites-store";

export const dynamic = "force-dynamic";

async function access(request: NextRequest) {
  const shareId = request.nextUrl.searchParams.get("share")?.trim();
  if (!shareId) return { error: NextResponse.json({ error: "Name the trip." }, { status: 400 }) };
  if (!favoritesStoreAvailable()) {
    return { error: NextResponse.json({ error: "Shared favorites are unavailable at the moment." }, { status: 503 }) };
  }

  const jar = await cookies();
  const asker = readSessionEmail(jar.get(accountCookieName())?.value);
  if (!asker) return { error: NextResponse.json({ error: "Please sign in first." }, { status: 401 }) };

  const owner = await getShareOwnerEmail(shareId);
  const nowhere = NextResponse.json({ error: "That trip is not here." }, { status: 404 });
  if (!owner) return { error: nowhere };
  const trip = await tripAccessFor(owner, asker);
  if (!trip.canView) return { error: nowhere };
  return { owner, asker, canComment: trip.canComment };
}

export async function GET(request: NextRequest) {
  const found = await access(request);
  if ("error" in found) return found.error;
  return NextResponse.json(
    { favorites: await readSharedFavorites(found.owner), canEdit: found.canComment, you: found.asker },
    { headers: { "cache-control": "private, no-store" } },
  );
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "That request did not come from this site." }, { status: 403 });
  const found = await access(request);
  if ("error" in found) return found.error;
  if (!found.canComment) {
    return NextResponse.json({ error: "You can look at this trip but not change the shared list." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    label?: string;
    href?: string;
    kind?: SharedFavorite["kind"];
  } | null;
  const problem = favoriteProblem({ label: body?.label, kind: body?.kind });
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const record = await getAccountRecord(found.asker);
  const favorite = await addSharedFavorite(found.owner, {
    label: body!.label!,
    href: body?.href,
    kind: body!.kind!,
    addedBy: found.asker,
    addedByName: record?.name,
  });
  if (!favorite) return NextResponse.json({ error: "That could not be saved." }, { status: 503 });
  return NextResponse.json({ favorite, favorites: await readSharedFavorites(found.owner) });
}

export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "That request did not come from this site." }, { status: 403 });
  const found = await access(request);
  if ("error" in found) return found.error;
  if (!found.canComment) {
    return NextResponse.json({ error: "You can look at this trip but not change the shared list." }, { status: 403 });
  }
  const id = request.nextUrl.searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ error: "Name the favorite." }, { status: 400 });
  const favorites = await removeSharedFavorite(found.owner, id);
  if (!favorites) return NextResponse.json({ error: "That could not be saved." }, { status: 503 });
  return NextResponse.json({ favorites });
}
