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
import { isVoteKind, tallyVotes } from "@/lib/trip-collaboration";
import { castVote, clearVote, readVotes, voteStoreAvailable } from "@/lib/trip-votes-store";

export const dynamic = "force-dynamic";

async function access(request: NextRequest) {
  const shareId = request.nextUrl.searchParams.get("share")?.trim();
  if (!shareId) return { error: NextResponse.json({ error: "Name the trip." }, { status: 400 }) };
  if (!voteStoreAvailable()) return { error: NextResponse.json({ error: "Voting is unavailable at the moment." }, { status: 503 }) };

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
  const votes = await readVotes(found.owner);
  const targets = [...new Set(votes.map((v) => v.targetId))];
  const tallies = Object.fromEntries(targets.map((id) => [id, tallyVotes(votes, id)]));
  return NextResponse.json(
    { votes, tallies, canVote: found.canComment, you: found.asker },
    { headers: { "cache-control": "private, no-store" } },
  );
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "That request did not come from this site." }, { status: 403 });
  const found = await access(request);
  if ("error" in found) return found.error;
  if (!found.canComment) {
    return NextResponse.json({ error: "You can look at this trip but not vote on it." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    targetId?: string;
    label?: string;
    kind?: string;
    value?: number;
    clear?: boolean;
  } | null;

  if (body?.clear && body.targetId) {
    const votes = await clearVote(found.owner, found.asker, body.targetId);
    if (!votes) return NextResponse.json({ error: "That could not be saved." }, { status: 503 });
    return NextResponse.json({ votes });
  }

  if (!isVoteKind(body?.kind) || (body?.value !== 1 && body?.value !== -1)) {
    return NextResponse.json({ error: "A vote needs a kind and a for/against." }, { status: 400 });
  }

  const record = await getAccountRecord(found.asker);
  const votes = await castVote(found.owner, {
    voter: found.asker,
    voterName: record?.name,
    targetId: body?.targetId ?? "",
    label: body?.label ?? "",
    kind: body.kind,
    value: body.value,
  });
  if (!votes) return NextResponse.json({ error: "That could not be saved." }, { status: 400 });
  return NextResponse.json({ votes });
}
