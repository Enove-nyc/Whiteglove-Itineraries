"use client";

import { useState } from "react";

/**
 * "That changed underneath us — reset what belonged to the old one."
 *
 * The sibling of useOnActionSuccess, and the same technique: adjusting state
 * during render instead of after the commit. Where that one watches an action
 * result, this watches an ordinary value — the beis hachaim being edited, the
 * team member a dialog was opened for — and runs a reset when it changes.
 *
 * WHY IT MATTERS MORE HERE THAN IT LOOKS. These resets close a pop-up that
 * belonged to the previous thing. As an effect, React paints once with the new
 * subject and the OLD pop-up still open — a dialog showing one person's
 * details under another person's heading, for a frame. Adjusting during render
 * means the paint that reaches the screen has already closed it.
 *
 * THE COMPARISON STATE IS NOT OPTIONAL. Without it every render re-runs the
 * reset and the component never settles. Identity, because that is what an
 * effect's dependency array compares too, so moving a reset here does not
 * quietly change when it fires.
 */
export function useOnValueChange<T>(value: T, onChange: () => void): void {
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    onChange();
  }
}
