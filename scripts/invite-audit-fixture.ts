import { createAccount } from "../lib/account-store";
import { createAccountInvitation } from "../lib/account-invitations";

// Trusted fixture setup; never a production endpoint or a public registration bypass.
if (process.env.AUDIT_ISOLATED !== "1" || new URL(process.env.UPSTASH_REDIS_REST_URL || "https://invalid").hostname !== "127.0.0.1") throw new Error("Fixture creation requires the disposable loopback store.");
async function main() {
const action = process.argv[2];
const identity = process.env.INVITE_AUDIT_IDENTITY || "owner@audit.local";
if (action === "owner") {
  const result = await createAccount(identity, "Audit-local-pass-1!", "Audit owner");
  if (!result.ok) throw new Error(result.error);
  console.log(JSON.stringify({ ok: true }));
} else if (action === "invitation") {
  const result = await createAccountInvitation(identity, "owner@audit.local");
  console.log(JSON.stringify({ token: result.token, id: result.invitation.id }));
} else throw new Error("Unknown fixture action.");

}
void main().catch(error => { console.error(error instanceof Error ? error.message : "Fixture setup failed."); process.exitCode = 1; });
