// A Business account's own staff — pure data model + pure transforms, the
// same discipline every other data/*.ts file here keeps.
//
// ONE ACCOUNT, MORE THAN ONE LOGIN. Everything about White Glove before this
// assumed a Business account was one person signing in. This is what changes
// that: the account itself (its trips, its pipeline, its library, its
// clients) is unchanged and still belongs to the one email that pays for it —
// the OWNER — but up to `staffSeats` (lib/account-limits.ts) other logins may
// be linked to it as TEAM MEMBERS, each with their own password and their own
// sign-in, all working against the same shared trips.
//
// A team member is not a second owner. The owner is the account the
// subscription is on; a member is a login that has been POINTED at it (see
// lib/account-store.ts's teamOwnerEmail on the member's own record) and can
// be unpointed by removing them — their own account, and their own sign-in,
// still exist afterward. Nothing about who owns the business ever moves.

export type TeamMemberStatus = "invited" | "active";

export type TeamMember = {
  /** The normalized identity — email or phone — this seat belongs to. */
  email: string;
  status: TeamMemberStatus;
  invitedAt: string;
  /** Set once they actually accept — an invited seat still counts against
   *  the seat limit, since the owner has already committed it to somebody. */
  joinedAt?: string;
  /**
   * The join token this invite was sent under — set only while status is
   * "invited". Kept on the roster entry (not just the invite's own
   * short-lived key) so withdrawing an invite can revoke that exact token:
   * without this, removing a pending member from the roster left the join
   * link itself still live, since lib/account-store.ts's invite key has no
   * other index to find and delete it by.
   */
  inviteToken?: string;
};

export function readTeam(stored: unknown): TeamMember[] {
  if (!Array.isArray(stored)) return [];
  const out: TeamMember[] = [];
  for (const entry of stored) {
    if (!entry || typeof entry !== "object") continue;
    const email = typeof (entry as TeamMember).email === "string" ? (entry as TeamMember).email.trim() : "";
    const invitedAt = typeof (entry as TeamMember).invitedAt === "string" ? (entry as TeamMember).invitedAt : "";
    if (!email || !invitedAt) continue;
    const status: TeamMemberStatus = (entry as TeamMember).status === "active" ? "active" : "invited";
    const joinedAt = typeof (entry as TeamMember).joinedAt === "string" ? (entry as TeamMember).joinedAt : undefined;
    const inviteToken = typeof (entry as TeamMember).inviteToken === "string" ? (entry as TeamMember).inviteToken : undefined;
    out.push({ email, status, invitedAt, joinedAt, inviteToken });
  }
  return out;
}

/**
 * Seats already spoken for — an invited seat counts the same as an active
 * one, because the owner has already committed it to somebody by sending
 * the invite. The owner's own seat is not in this count; see staffSeats'
 * own note in lib/account-limits.ts for why it never needs to be.
 */
export function seatsUsed(team: TeamMember[]): number {
  return team.length;
}

/**
 * Why a new invite cannot be sent, or null.
 *
 * `existingTeam` excludes anybody already being removed in the same request
 * — the caller's job, not this function's, to decide who is still on the
 * roster before asking whether there is room for one more.
 */
export function inviteProblem(
  input: { email: string; ownerEmail: string; existingTeam: TeamMember[]; seats: number | null },
  same: (a: string, b: string) => boolean = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase(),
): string | null {
  const email = input.email.trim();
  if (!email) return "Enter an email address or a phone number.";
  if (same(email, input.ownerEmail)) return "That is your own account.";
  if (input.existingTeam.some((m) => same(m.email, email))) return "Already on your team.";
  if (input.seats !== null && seatsUsed(input.existingTeam) >= input.seats) {
    return `Your plan includes ${input.seats} staff ${input.seats === 1 ? "login" : "logins"}, and every one is in use. Remove somebody first, or ask about a bigger plan.`;
  }
  return null;
}

/** "2 of 3 staff logins used." Never null — a screen should always be able to say. */
export function describeSeats(team: TeamMember[], seats: number | null): string {
  const used = seatsUsed(team);
  if (seats === null) return used === 1 ? "1 staff login." : `${used} staff logins.`;
  const left = seats - used;
  if (left <= 0) return `${used} of ${seats} staff ${seats === 1 ? "login" : "logins"} used.`;
  return `${used} of ${seats} staff ${seats === 1 ? "login" : "logins"} used. ${left === 1 ? "One more" : `${left} more`} can be added.`;
}
