"use client";

import { type ReactNode } from "react";
import { useFormStatus } from "react-dom";

/**
 * A submit button that cannot be pressed twice.
 *
 * Every admin queue — photos to publish, listings to restore, plan requests to
 * grant, ratings to answer, messages to close — is a `<form action={…}>` with
 * a plain `<button type="submit">`. Each one carried `disabled:opacity-60` in
 * its class list, so somebody once meant it to disable while the action ran,
 * and none of them did: nothing set `disabled`. On a slow connection a second
 * press sent the same approval or restore twice.
 *
 * `useFormStatus` reads the state of the form this button is inside, so the
 * button knows the action is in flight without the page having to thread a
 * pending flag down to it. It must be rendered INSIDE the form — that is the
 * hook's contract, and why this is a component rather than a prop.
 *
 * The label changes to `busyLabel` while pending, so the owner sees the press
 * land rather than wondering whether it did.
 */
export default function PendingSubmit({
  children,
  busyLabel = "Working…",
  className,
  disabled = false,
  ...rest
}: {
  children: ReactNode;
  /** What the button says while the action runs. */
  busyLabel?: ReactNode;
  className?: string;
  disabled?: boolean;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "type" | "disabled" | "className" | "children">) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || disabled} aria-busy={pending || undefined} className={className} {...rest}>
      {pending ? busyLabel : children}
    </button>
  );
}
