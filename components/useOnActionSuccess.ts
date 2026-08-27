"use client";

import { useState } from "react";

/**
 * "That save went through — put the form away."
 *
 * SIX SCREENS HAD THIS AS AN EFFECT, and all six were the same three lines:
 * watch a useActionState result, and when a new one comes back ok, close the
 * dialog or clear the dirty flag. As an effect that is a setState after the
 * commit — React paints the form once more, still open, and only then closes
 * it. Small, but it is a visible flash of a form the person has finished with,
 * and it is what react-hooks/set-state-in-effect is pointing at.
 *
 * THIS IS REACT'S OWN ANSWER, not a workaround for the rule: adjusting state
 * during render when a value changes. The comparison state is what makes it
 * safe — without it, every render would re-close and the component would never
 * settle. React re-runs the render before committing anything, so the paint
 * that reaches the screen is already the closed one.
 *
 * A HOOK RATHER THAN SIX COPIES. The pattern is subtle enough that six
 * hand-written versions would drift, and one of them would drift into the
 * version without the comparison — which is an infinite render loop, not a
 * bug you find later. Written once, it is one thing to get right.
 *
 * IDENTITY, NOT `ok`, DECIDES WHAT COUNTS AS NEW. useActionState hands back a
 * fresh object per submission, so two successful saves in a row are two
 * different objects and both close the form. Comparing on `ok` alone would
 * make the second one a no-op.
 */

export type ActionLike = { ok?: boolean } | null | undefined;

/**
 * Has a NEW result arrived since the last one this component acted on?
 *
 * Exported and pure so it can be tested without a renderer. The infinite-loop
 * case — a version that answers "yes" every render — is not something to find
 * in a browser.
 */
export function hasNewResult(results: readonly ActionLike[], seen: readonly ActionLike[]): boolean {
  if (results.length !== seen.length) return true;
  return results.some((result, index) => result !== seen[index]);
}

export function useOnActionSuccess(results: readonly ActionLike[], onSuccess: () => void): void {
  const [seen, setSeen] = useState(results);
  if (hasNewResult(results, seen)) {
    setSeen(results);
    if (results.some((result) => result?.ok)) onSuccess();
  }
}
