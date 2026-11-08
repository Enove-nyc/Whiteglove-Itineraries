import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * "CLICKING DELETE DOES NOTHING: NO DIALOG, NO DELETION."
 *
 * The handler was right. Clicked cold it asks, calls the API, and the row
 * goes — checked against a running server before anything here changed. What
 * failed was `window.confirm`, which is the browser's dialog and not ours.
 *
 * Chrome offers "prevent this page from creating additional dialogs" as soon
 * as a page opens a second one in quick succession, and once that is ticked
 * every later confirm() returns FALSE with nothing drawn, for the life of the
 * tab. `if (confirm(…)) { delete }` then reads a refusal the person never
 * made. A walkthrough that deletes a few things in a row is exactly how
 * somebody ends up ticking it — and after that every destructive button on
 * the site is dead and silent.
 *
 * So the question is asked in the page instead.
 */
const DIALOG = readFileSync("components/ui/ConfirmDialog.tsx", "utf8");
const SWITCHER = readFileSync("components/TripSwitcher.tsx", "utf8");

describe("deleting a trip asks in the page, not through the browser", () => {
  it("TripSwitcher calls no window.confirm at all", () => {
    // Both of its destructive actions — the trip and the template.
    assert.doesNotMatch(SWITCHER, /\bconfirm\(/);
  });

  it("both of them go through the in-page dialog", () => {
    assert.match(SWITCHER, /const \{ dialog: confirmDialog, ask \} = useConfirm\(\);/);
    assert.match(SWITCHER, /title: `Delete “\$\{trip\.name\}”\?`/);
    assert.match(SWITCHER, /title: `Delete the template “\$\{tpl\.name\}”\?`/);
    assert.match(SWITCHER, /onConfirm: \(\) => void act\("delete", \{ id: trip\.id \}, trip\.active\)/);
    assert.match(SWITCHER, /onConfirm: \(\) => void templateAct\("delete", \{ id: tpl\.id \}\)/);
  });

  it("and the dialog is actually rendered — a hook whose output is dropped asks nobody", () => {
    assert.match(SWITCHER, /\{confirmDialog\}/);
  });
});

describe("the dialog itself", () => {
  it("is a real modal: focus trapped, Escape closes, backdrop cancels", () => {
    assert.match(DIALOG, /useFocusTrap<HTMLDivElement>\(Boolean\(request\), close\)/);
    assert.match(DIALOG, /role="dialog"/);
    assert.match(DIALOG, /aria-modal="true"/);
    assert.match(DIALOG, /if \(event\.target === event\.currentTarget\) close\(\);/);
  });

  it("puts Cancel before the destructive button in the DOM", () => {
    // useFocusTrap focuses whatever is first. On a dialog that is one press
    // from deleting somebody's trip, that has to be the safe one.
    const cancel = DIALOG.indexOf(">\n            Cancel");
    const confirmButton = DIALOG.indexOf("{request.confirmLabel ?? \"Delete\"}");
    assert.ok(cancel > -1 && confirmButton > -1, "both buttons are present");
    assert.ok(cancel < confirmButton, "Cancel comes first");
  });

  it("closes before running the action, so the dialog cannot be pressed twice", () => {
    assert.match(DIALOG, /const go = request\.onConfirm;\s*\n\s*close\(\);\s*\n\s*go\(\);/);
  });
});
