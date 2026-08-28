/**
 * One shared set of thin, consistent icons.
 *
 * Every icon here means the same thing everywhere it appears — the header,
 * the mobile bar, a listing's action row — so a visitor learns a symbol once.
 * Stroke-based, no fill, 1.6 weight throughout: the "consistent thin icons"
 * the design calls for. New icons should match that weight rather than being
 * dropped in from wherever they were copied.
 *
 * ICON-ONLY USE NEEDS A LABEL. This component only draws the mark; the
 * caller is responsible for an aria-label (or visible text) and, on desktop,
 * a title/tooltip. Nothing here should ship icon-only with no name — that is
 * exactly the "never make users guess" rule.
 */

export type IconName =
  | "search"
  | "route"
  | "suitcase"
  | "account"
  | "chevron-down"
  | "menu"
  | "close"
  | "directions"
  | "phone"
  | "website"
  | "share"
  | "heart"
  | "heart-filled"
  | "pencil"
  | "flag"
  | "map-pin"
  | "list"
  | "map"
  | "star"
  | "star-filled"
  | "lightbulb"
  | "plane"
  | "bed"
  | "check"
  | "sparkle"
  | "camera"
  | "video"
  | "microphone"
  | "stop"
  | "more"
  | "reply"
  | "check-check"
  | "trash"
  | "home"
  | "chat"
  | "wallet"
  | "paperclip"
  | "image"
  | "send";

const PATHS: Record<IconName, React.ReactNode> = {
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M20 20 15.3 15.3" />
    </>
  ),
  route: (
    <>
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="18" cy="18" r="2.5" />
      <path d="M8 7.5c2 1 3 2.6 3 4.5s2 5 4 5c1.4 0 2.4-.5 3-1.3" />
    </>
  ),
  suitcase: (
    <>
      <rect x="3" y="7.5" width="18" height="12" rx="2" />
      <path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5" />
      <path d="M3 12.5h18" />
    </>
  ),
  account: (
    <>
      <circle cx="12" cy="8.2" r="3.5" />
      <path d="M4.5 20c1.4-3.6 4.3-5.5 7.5-5.5s6.1 1.9 7.5 5.5" />
    </>
  ),
  "chevron-down": <path d="M6 9.5 12 15.5 18 9.5" />,
  menu: (
    <>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </>
  ),
  close: (
    <>
      <path d="M6 6l12 12" />
      <path d="M18 6 6 18" />
    </>
  ),
  directions: (
    <>
      <path d="M12 3v18" />
      <path d="M6 8l6-5 6 5" />
      <path d="M6 21l6-5 6 5" />
    </>
  ),
  phone: <path d="M6.5 4h3l1.5 4.5-2 1.7a12 12 0 0 0 5.3 5.3l1.7-2 4.5 1.5v3a2 2 0 0 1-2.2 2A17 17 0 0 1 4.5 6.2 2 2 0 0 1 6.5 4Z" />,
  website: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17" />
      <path d="M12 3.5c2.2 2.3 3.4 5.3 3.4 8.5s-1.2 6.2-3.4 8.5c-2.2-2.3-3.4-5.3-3.4-8.5S9.8 5.8 12 3.5Z" />
    </>
  ),
  share: (
    <>
      <circle cx="18" cy="6" r="2.3" />
      <circle cx="6" cy="12" r="2.3" />
      <circle cx="18" cy="18" r="2.3" />
      <path d="M8.1 10.8 15.9 7.2" />
      <path d="M8.1 13.2 15.9 16.8" />
    </>
  ),
  heart: <path d="M12 20.2S3.8 15.4 3.8 9.4A4.6 4.6 0 0 1 12 6.6a4.6 4.6 0 0 1 8.2 2.8c0 6-8.2 10.8-8.2 10.8Z" />,
  "heart-filled": <path d="M12 20.2S3.8 15.4 3.8 9.4A4.6 4.6 0 0 1 12 6.6a4.6 4.6 0 0 1 8.2 2.8c0 6-8.2 10.8-8.2 10.8Z" fill="currentColor" stroke="none" />,
  pencil: (
    <>
      <path d="M4 20l.9-4L16 4.9a1.8 1.8 0 0 1 2.5 0l.6.6a1.8 1.8 0 0 1 0 2.5L8 19.1Z" />
      <path d="M14 7 17 10" />
    </>
  ),
  flag: (
    <>
      <path d="M6 3.5v17" />
      <path d="M6 4.5c2-1 4-1 6 0s4 1 6 0v9c-2 1-4 1-6 0s-4-1-6 0Z" />
    </>
  ),
  "map-pin": (
    <>
      <path d="M12 21s-6.8-6.1-6.8-11.2a6.8 6.8 0 1 1 13.6 0C18.8 14.9 12 21 12 21Z" />
      <circle cx="12" cy="9.6" r="2.3" />
    </>
  ),
  list: (
    <>
      <path d="M8.5 6.5h11" />
      <path d="M8.5 12h11" />
      <path d="M8.5 17.5h11" />
      <path d="M4.3 6.5h.01" />
      <path d="M4.3 12h.01" />
      <path d="M4.3 17.5h.01" />
    </>
  ),
  map: (
    <>
      <path d="M9 4.5 4 6.3v13.2l5-1.8" />
      <path d="M9 4.5l6 2.2v13.2l-6-2.2" />
      <path d="M15 6.7l5-1.8v13.2l-5 1.8" />
    </>
  ),
  star: <path d="M12 4.2 14 9.6l5.6.5-4.3 3.7 1.4 5.5-4.7-3-4.7 3 1.4-5.5-4.3-3.7 5.6-.5Z" />,
  "star-filled": <path d="M12 4.2 14 9.6l5.6.5-4.3 3.7 1.4 5.5-4.7-3-4.7 3 1.4-5.5-4.3-3.7 5.6-.5Z" fill="currentColor" stroke="none" />,
  lightbulb: (
    <>
      <path d="M9 18h6" />
      <path d="M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.4 10.9c.9.7 1.4 1.6 1.4 2.6h4c0-1 .5-1.9 1.4-2.6A6 6 0 0 0 12 3Z" />
    </>
  ),
  plane: (
    <>
      <path d="M10.5 13.5 3.5 11l1.2-1.2 5.6.7 4.5-4.5a1.6 1.6 0 0 1 2.3 2.3l-4.5 4.5.7 5.6L12 19.6l-2.5-7" />
      <path d="M4.5 19.5 8 16" />
    </>
  ),
  bed: (
    <>
      <path d="M3 19v-7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v7" />
      <path d="M3 19v1.5" />
      <path d="M21 19v1.5" />
      <path d="M3 15h18" />
      <rect x="5" y="10" width="5" height="4" rx="1.3" />
    </>
  ),
  check: <path d="M5 12.5 9.5 17 19 7" />,
  // The assistant's mark: a four-point spark, same 1.6 stroke as the rest.
  sparkle: (
    <>
      <path d="M12 4.5 13.7 10.3 19.5 12 13.7 13.7 12 19.5 10.3 13.7 4.5 12 10.3 10.3Z" />
      <path d="M18.5 4.5v3" />
      <path d="M17 6h3" />
    </>
  ),
  camera: (
    <>
      <path d="M4 8.3a2 2 0 0 1 2-2h1.3l1.1-1.7a1.6 1.6 0 0 1 1.3-.7h4.6a1.6 1.6 0 0 1 1.3.7l1.1 1.7H18a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" />
      <circle cx="12" cy="12.6" r="3.4" />
    </>
  ),
  video: (
    <>
      <rect x="3" y="7" width="12.5" height="10" rx="2.2" />
      <path d="M15.5 10.4 20.5 7v10l-5-3.4Z" />
    </>
  ),
  microphone: (
    <>
      <rect x="9" y="3.5" width="6" height="11" rx="3" />
      <path d="M6 11.3a6 6 0 0 0 12 0" />
      <path d="M12 17.3v3.2" />
      <path d="M9 20.5h6" />
    </>
  ),
  stop: <rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" stroke="none" />,
  // Three small dots — an overflow menu, not a shape drawn from the same
  // stroke as the rest; filled, because at this size a stroked circle is
  // barely a dot at all.
  more: (
    <>
      <circle cx="5.5" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="18.5" cy="12" r="1.6" fill="currentColor" stroke="none" />
    </>
  ),
  reply: (
    <>
      <path d="M10 7 4 12l6 5" />
      <path d="M4 12h9a7 7 0 0 1 7 7v1" />
    </>
  ),
  // Two offset checks — a message read, not just sent. `check` alone still
  // means "sent"; this is the pair a messaging app shows once the other side
  // has actually seen it.
  "check-check": (
    <>
      <path d="M1.5 12.5 6 17 13 9.5" />
      <path d="M9 12.5 13.5 17 22.5 7" />
    </>
  ),
  trash: (
    <>
      <path d="M5 7h14" />
      <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" />
      <path d="M7 7l.8 12a2 2 0 0 0 2 1.9h4.4a2 2 0 0 0 2-1.9L17 7" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </>
  ),
  home: (
    <>
      <path d="M3.5 11 12 4l8.5 7" />
      <path d="M5.5 9.6V20h13V9.6" />
    </>
  ),
  chat: (
    <>
      <path d="M20 4H4a2 2 0 0 0-2 2v8.5a2 2 0 0 0 2 2h3.2v3.2L11.6 16.5H20a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Z" />
      <path d="M7.5 9h9M7.5 12h5.5" />
    </>
  ),
  wallet: (
    <>
      <rect x="3.5" y="6.5" width="17" height="12" rx="2.5" />
      <path d="M20.5 11.5h-4a1.75 1.75 0 0 0 0 3.5h4" />
    </>
  ),
  paperclip: (
    <path d="M20.4 11.5 12 19.9a5 5 0 0 1-7-7l8-8a3.3 3.3 0 1 1 4.7 4.7l-8.1 8a1.6 1.6 0 0 1-2.3-2.3l7.4-7.3" />
  ),
  image: (
    <>
      <rect x="3" y="3.5" width="18" height="17" rx="3" />
      <circle cx="8.5" cy="9" r="1.7" />
      <path d="M4 17.5 9.2 12.6a2 2 0 0 1 2.7-.1l3 2.6M14 13.5l1.8-1.7a2 2 0 0 1 2.7 0L21 14" />
    </>
  ),
  send: (
    <>
      <path d="M21.5 3.2 2.8 10.4a.6.6 0 0 0 .05 1.13l7.3 2.35 2.35 7.3a.6.6 0 0 0 1.13.05Z" />
      <path d="M21.5 3.2 10.15 13.88" />
    </>
  ),
};

export function Icon({
  name,
  className = "h-5 w-5",
  strokeWidth = 1.6,
}: {
  name: IconName;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
