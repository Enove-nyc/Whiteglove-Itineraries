"use client";

import Link from "next/link";
import { Icon, type IconName } from "@/components/icons/Icon";

/**
 * An icon-only control with a name. `title` gives the desktop hover tooltip
 * (native, no JS); `aria-label` gives every screen reader the same word.
 * Never render Icon bare where a visitor could click it — this is the only
 * approved wrapper for an icon-only link or button.
 */

const BASE =
  "inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-[var(--navy)] transition hover:bg-[var(--cream-deep)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--navy)] focus-visible:outline-offset-2";

export function IconLink({
  icon,
  label,
  href,
  className = "",
  active = false,
  external = false,
  onClick,
}: {
  icon: IconName;
  label: string;
  href: string;
  className?: string;
  active?: boolean;
  /** Opens in a new tab — a partner site, a map, a phone number's own app. */
  external?: boolean;
  /**
   * Do something here instead of going there.
   *
   * For the one case where a destination exists and is not the best answer:
   * the header's Sign in, which has a real page behind it but should open a
   * dialog and leave the reader where they are. It renders a button rather
   * than a link with its navigation cancelled, so it is a button to a screen
   * reader too, and the href stays as the fallback for anything that renders
   * this without a handler.
   */
  onClick?: () => void;
}) {
  const classes = `${BASE} ${active ? "bg-[var(--cream-deep)]" : ""} ${className}`;
  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-label={label} title={label} className={classes}>
        <Icon name={icon} />
      </button>
    );
  }
  if (external || href.startsWith("tel:") || href.startsWith("http")) {
    return (
      <a href={href} aria-label={label} title={label} target={href.startsWith("tel:") ? undefined : "_blank"} rel={href.startsWith("tel:") ? undefined : "noreferrer"} className={classes}>
        <Icon name={icon} />
      </a>
    );
  }
  return (
    <Link href={href} aria-label={label} title={label} className={classes}>
      <Icon name={icon} />
    </Link>
  );
}

export function IconButton({
  icon,
  label,
  onClick,
  className = "",
  active = false,
  type = "button",
  ref,
}: {
  icon: IconName;
  label: string;
  onClick?: () => void;
  className?: string;
  active?: boolean;
  type?: "button" | "submit";
  /**
   * So a dialog this button opens can hand focus back to it on close.
   * Without it, closing drops the keyboard at the top of the document and
   * the next Tab starts the page over — see components/PreviewDialog.tsx.
   */
  ref?: React.Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={ref}
      type={type}
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`${BASE} ${active ? "bg-[var(--cream-deep)] text-[var(--gold-ink)]" : ""} ${className}`}
    >
      <Icon name={icon} />
    </button>
  );
}
