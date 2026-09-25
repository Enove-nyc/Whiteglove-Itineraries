import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * A FULLY BUILT PROPOSAL WAS LOST ON NAVIGATION.
 *
 * Everything typed into the proposal editor lived in React state until
 * somebody pressed Save, and nothing on the screen said so. Three things
 * follow from that and all three are held here: the work saves itself, the
 * page says whether it has, and the preview shows what is on screen rather
 * than whatever the server last happened to hold.
 */
const BUILDER = readFileSync("components/ProposalBuilder.tsx", "utf8");
const STORE = readFileSync("lib/account-store.ts", "utf8");
const PAGE = readFileSync("app/p/[shareId]/page.tsx", "utf8");

describe("the proposal editor does not lose work", () => {
  it("knows what the server holds by comparing against it, not by a dirty flag", () => {
    // A boolean drifts out of step the moment a save fails or a load lands,
    // and then it either warns about nothing or fails to warn at all.
    assert.match(BUILDER, /const unsaved = Boolean\(proposal\) && baseline !== null && JSON\.stringify\(proposal\) !== baseline;/);
  });

  it("baselines what is on screen when it opens, saved or not", () => {
    // Baselining only the SERVER's copy made an untouched new proposal read as
    // unsaved work: it warned on the way out and autosaved an empty proposal
    // onto the trip before anybody had typed anything. Reproduced, then fixed.
    assert.match(BUILDER, /setBaseline\(JSON\.stringify\(loaded\)\);/);
    assert.match(BUILDER, /setOnServer\(Boolean\(data\.proposal\)\);/);
  });

  it("autosaves after the typing stops, and only while there is something to save", () => {
    const effect = BUILDER.slice(BUILDER.indexOf("AUTOSAVE, a second and a half"));
    assert.match(effect, /if \(!unsaved \|\| busy \|\| !tripId\) return;/);
    assert.match(effect, /window\.setTimeout\(\(\) => \{[\s\S]*?void save\(true\)/);
    assert.match(effect, /\}, 1500\);/);
    assert.match(effect, /return \(\) => window\.clearTimeout\(timer\);/);
  });

  it("the quiet save does not overwrite the editor with the server's echo", () => {
    // Otherwise a save landing mid-sentence replaces what is being typed.
    const save = BUILDER.slice(BUILDER.indexOf("const save = useCallback"), BUILDER.indexOf("AUTOSAVE, a second and a half"));
    assert.match(save, /const sending = JSON\.stringify\(proposal\);/);
    assert.match(save, /setBaseline\(quiet \? sending : JSON\.stringify\(data\.proposal\)\);/);
    assert.match(save, /if \(!quiet\) \{[\s\S]*?setProposal\(data\.proposal\);/);
  });

  it("still warns on the way out, for the second and a half in between", () => {
    assert.match(BUILDER, /window\.addEventListener\("beforeunload", warn\);/);
    assert.match(BUILDER, /if \(!unsaved\) return;/);
  });

  it("says out loud whether it is saved", () => {
    assert.match(BUILDER, /aria-live="polite"/);
    assert.match(BUILDER, /saving \? "Saving…" : unsaved \? "Unsaved changes" : onServer \? "All changes saved" : ""/);
  });
});

describe("preview as client shows the proposal, not a dead end", () => {
  it("saves first", () => {
    // getSharedProposal returns null when the trip has no stored proposal, so
    // previewing one nobody had saved showed the advisor "This proposal isn't
    // available" about the proposal they were looking at.
    const preview = BUILDER.slice(BUILDER.indexOf("async function preview()"));
    assert.match(preview, /await save\(\);\s*\n\s*const data = await post\(\{ action: "share" \}\);/);
  });

  it("the advisor's own preview is not recorded as the client reading it", () => {
    assert.match(STORE, /export async function getSharedProposal\(shareId: string, viewer\?: string \| null\)/);
    assert.match(STORE, /const isOwner = Boolean\(viewer\) && normalizeId\(viewer!\) === normalizeId\(rec\.ownerEmail\);/);
    assert.match(STORE, /if \(proposal\.status === "sent" && !isOwner\) \{/);
  });

  it("and the page tells it who is looking", () => {
    assert.match(PAGE, /const shared = await getSharedProposal\(shareId, viewer\);/);
    // Read from the session, not from the address: a flag in the URL is
    // something the client's browser can carry too.
    assert.doesNotMatch(PAGE, /searchParams.*preview/);
  });
});
