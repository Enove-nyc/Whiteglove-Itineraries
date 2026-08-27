import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * A CLIENT LINK MUST NEVER RENDER AN ADVISOR'S CONTROLS.
 *
 * CompanionApp is one component serving two people. An advisor opens it signed
 * in to the account that owns the trip; a client opens the same screens
 * through a per-trip share token, with no account at all. The difference
 * between them is one boolean — `isClientViewer`, from the chat side the
 * server resolved — and every control that belongs to only one of them hangs
 * off it.
 *
 * An outside audit named this as the risk in that arrangement: a component
 * that switches roles internally can leak one role's controls into the other's
 * view by a single misplaced guard, and it would look like nothing at all in
 * review. Its recommendation was to split the component. That is weeks of
 * regression risk on a working screen for no change anybody can see, so this
 * is the other half of the recommendation instead — the tests it also asked
 * for, which protect the actual invariant.
 *
 * WHAT LEAKING WOULD COST. The share toggle decides whether a document is
 * visible to the client; the note editor writes the advisor's own words onto
 * the trip; the alert composer sends to the client's phone. A client who
 * could reach any of those could publish their own documents, edit their
 * advisor's notes, or send themselves an alert from their advisor.
 *
 * The server is still the thing enforcing this — attachments are served only
 * to the owning account, and every write checks the session. This file guards
 * the interface, which is the layer that would show a client a door they then
 * discover is locked.
 */

const APP = readFileSync("components/companion/CompanionApp.tsx", "utf8");

/**
 * The text of the JSX conditional that renders `<Name`, found by walking back
 * to the `{` that opens its expression container. Crude in the general case,
 * exact for the shape these all use: `{guard && <Name ... />}`.
 */
function guardBefore(source: string, at: number): string {
  let depth = 0;
  for (let i = at; i >= 0; i--) {
    const c = source[i];
    if (c === "}") depth++;
    else if (c === "{") {
      if (depth === 0) return source.slice(i, at);
      depth--;
    }
  }
  return "";
}

/** Every advisor-only control, and what a client reaching it could do. */
const ADVISOR_ONLY = [
  ["WalletShareToggle", "publish their own documents to themselves"],
  ["WalletAttach", "upload files onto the advisor's trip"],
  ["GuideNoteEdit", "rewrite the advisor's own notes"],
  ["AdvisorAlertComposer", "send themselves an alert from their advisor"],
] as const;

describe("the client's view of the app carries none of the advisor's controls", () => {
  it("decides who the viewer is from the server's answer, not the browser's", () => {
    // Not a prop the client could influence and not anything read off the
    // URL: the side of the chat the server resolved from the share token.
    assert.match(APP, /const isClientViewer = liveChat\?\.side === "client";/);
  });

  for (const [component, damage] of ADVISOR_ONLY) {
    it(`${component} is never rendered for a client`, () => {
      const uses = [...APP.matchAll(new RegExp(`<${component}\\b`, "g"))];
      assert.ok(uses.length > 0, `${component} is not rendered anywhere — has it been renamed?`);

      for (const use of uses) {
        const guard = guardBefore(APP, use.index);
        assert.match(
          guard,
          /!isClientViewer/,
          `${component} is rendered without a !isClientViewer guard. A client could ${damage}.`,
        );
      }
    });
  }

  it("does not give a client the advisor's inbox", () => {
    // advisorInbox lists every client's chat, so it is the one prop that must
    // never arrive on a share-token route. Both client routes are checked by
    // name rather than by scanning, because the point is that THESE two stay
    // clean.
    for (const route of ["app/t/[shareId]/app/page.tsx", "app/i/[shareId]/app/page.tsx"]) {
      const source = readFileSync(route, "utf8");
      assert.doesNotMatch(source, /advisorInbox/, `${route} hands a client the advisor's inbox`);
    }
  });

  it("shows a client only the days their advisor actually wrote a note on", () => {
    // Not a control, but the same boundary: an advisor sees every day so they
    // can add notes, a client sees the ones with something on them. Without
    // this a client's Guide is a list of empty days.
    assert.match(APP, /const guideDays = days\.filter\(\(d\) => \(isClientViewer \? d\.guideNote : true\)\)/);
  });
});
