"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons/Icon";
import { useFocusTrap } from "@/components/useFocusTrap";
import { ASSISTANT_INPUT_NOTICE } from "@/lib/assistant-disclosure";
import {
  handOffHref,
  HAND_OFF_LABEL,
  NOT_COVERED_MESSAGE,
  SITE_ANSWER_LABEL,
  SITE_ASSISTANT_LABEL,
  SITE_ASSISTANT_SUPPORT,
} from "@/lib/site-assistant";
import type { AssistantTurn } from "@/lib/assistant-conversation";

/**
 * The assistant, in the corner of every page.
 *
 * BOTTOM RIGHT, AND ABOVE THE MOBILE BAR. The site's bottom bar owns the
 * bottom edge on a phone, so this sits above it there and on the edge
 * everywhere else. It is deliberately small until it is opened: a launcher
 * that covered a corner of every page would be a cost paid by everybody who
 * never uses it.
 *
 * IT ANSWERS FROM THIS SITE AND NOTHING ELSE. When White Glove has no page
 * covering the question it says so and offers the other assistant, which
 * answers from an AI model's general knowledge and is labelled as such. That
 * hand-off is the honest version of a site assistant, and the reason there are
 * two — see lib/site-assistant.ts.
 *
 * SIGNED IN, THE CONVERSATION IS KEPT; SIGNED OUT, IT IS NOT KEPT ANYWHERE.
 * Not in this component's memory beyond the visit, and not in the browser. The
 * panel says which of the two is happening rather than leaving somebody to
 * assume, because a person asking where their family is going in August is
 * entitled to know whether it is being written down.
 */

type Thread = { turns: AssistantTurn[]; signedIn: boolean; kept: boolean };

/**
 * The White Glove app — the owner's own trip at /app, and a client's trip at
 * /i/<shareId>/app or /t/<shareId>/app. Every one of them fills the whole
 * screen with its own chrome (tabs, a travel wallet, the chat with the real
 * adviser) and none of the site's own. A corner launcher floating over it has
 * nothing to do there and only sits in the way of the app's own buttons in
 * that same corner — the exact complaint the owner raised. So it is hidden on
 * all of them, not only the client-code links.
 */
export function isCompanionAppView(pathname: string | null): boolean {
  return /^\/(app|(i|t)\/[^/]+\/app)(\/|$)/.test(pathname ?? "");
}

/** "rgb(a)(…)" → its parts, or null for a value we cannot read. */
function parseRgb(value: string): { r: number; g: number; b: number; a: number } | null {
  const match = value.match(/rgba?\(([^)]+)\)/);
  if (!match) return null;
  const parts = match[1].split(",").map((piece) => parseFloat(piece.trim()));
  if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return null;
  const [r, g, b, a = 1] = parts;
  return { r, g, b, a };
}

/**
 * Is the section under the launcher a dark one?
 *
 * The button is fixed in the corner and floats over navy bands and cream ones
 * as the page scrolls, so it reads the colour behind it and flips: cream on
 * navy, navy on cream. It samples the real pixel stack at its own centre —
 * skipping itself and its panel — and walks up for the first element that
 * actually paints a background, then decides by luminance. Nothing has to be
 * tagged; a new section is handled the moment it exists.
 */
function darkBehind(launcher: HTMLElement): boolean {
  const rect = launcher.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  if (y < 0 || y > window.innerHeight || x < 0 || x > window.innerWidth) return false;
  const behind = document.elementsFromPoint(x, y).find((el) => !el.closest("[data-assistant]"));
  for (let el: Element | null = behind ?? null; el; el = el.parentElement) {
    const rgb = parseRgb(getComputedStyle(el).backgroundColor);
    if (rgb && rgb.a > 0.15) {
      const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
      return luminance < 0.5;
    }
  }
  return false;
}

export default function SiteAssistant() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [thread, setThread] = useState<Thread>({ turns: [], signedIn: false, kept: false });
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const panelRef = useFocusTrap<HTMLDivElement>(open, () => setOpen(false));
  const endRef = useRef<HTMLDivElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const loaded = useRef(false);
  // Cream on a navy band, navy on a cream one. Starts navy (the commonest
  // ground) so first paint matches, then corrects itself after mount.
  const [onDark, setOnDark] = useState(false);

  useEffect(() => {
    const launcher = launcherRef.current;
    if (!launcher) return;
    let frame = 0;
    const sample = () => {
      frame = 0;
      setOnDark(darkBehind(launcher));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(sample);
    };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);

  // The stored conversation is fetched the first time the panel is opened,
  // never on page load: this is on every page, and a request on every page
  // view for a panel most people never open is a cost for nothing.
  useEffect(() => {
    if (!open || loaded.current) return;
    loaded.current = true;
    void (async () => {
      try {
        const response = await fetch("/api/account/assistant");
        const data = await response.json();
        setThread({
          turns: Array.isArray(data.turns) ? data.turns : [],
          signedIn: Boolean(data.signedIn),
          kept: Boolean(data.kept),
        });
      } catch {
        /* An unreachable store is an empty thread, not an error to read. */
      }
    })();
  }, [open]);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ block: "end" });
  }, [open, thread.turns.length, busy]);

  const ask = useCallback(
    async (asked: string) => {
      const text = asked.trim();
      if (!text || busy) return;
      const mine: AssistantTurn = { role: "traveler", text, at: new Date().toISOString() };
      setThread((current) => ({ ...current, turns: [...current.turns, mine] }));
      setQuestion("");
      setBusy(true);
      try {
        const response = await fetch("/api/assistant/site", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: text }),
        });
        const data = await response.json();
        const reply: AssistantTurn = data?.covered
          ? {
              role: "assistant",
              text: String(data.text ?? ""),
              at: new Date().toISOString(),
              ...(Array.isArray(data.sources) && data.sources.length ? { sources: data.sources } : {}),
            }
          : { role: "assistant", text: NOT_COVERED_MESSAGE, at: new Date().toISOString(), notCovered: true };
        setThread((current) => ({ ...current, turns: [...current.turns, reply] }));
        // Kept only for somebody signed in. The route decides that, not this;
        // posting either way keeps one path through the code.
        void fetch("/api/account/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ turns: [mine, reply] }),
        }).catch(() => undefined);
      } catch {
        setThread((current) => ({
          ...current,
          turns: [
            ...current.turns,
            { role: "assistant", text: NOT_COVERED_MESSAGE, at: new Date().toISOString(), notCovered: true },
          ],
        }));
      } finally {
        setBusy(false);
      }
    },
    [busy],
  );

  // All hooks above have already run unconditionally; bailing here, right
  // before the render, is what keeps this a normal early return rather than a
  // rules-of-hooks violation.
  if (isCompanionAppView(pathname)) return null;

  return (
    <>
      <button
        ref={launcherRef}
        type="button"
        data-assistant="launcher"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="site-assistant-panel"
        aria-label={SITE_ASSISTANT_LABEL}
        // Above the mobile bottom bar on a phone, on the edge everywhere else.
        // The colour flips with the band behind it — cream over navy, navy over
        // cream — and both go to gold on hover.
        className={`fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-4 z-[var(--wg-z-popover)] inline-flex h-12 min-h-11 items-center gap-2 rounded-full border px-4 text-xs font-bold uppercase tracking-[0.1em] shadow-[0_10px_30px_rgba(23,45,82,.28)] transition hover:border-[var(--gold)] hover:bg-[var(--gold)] hover:text-white sm:bottom-5 ${
          onDark
            ? "border-[var(--cream)] bg-[var(--cream)] text-[var(--navy)]"
            : "border-[var(--navy)] bg-[var(--navy)] text-white"
        }`}
      >
        <Icon name="sparkle" className="h-4 w-4" />
        <span className="hidden sm:inline">Ask</span>
      </button>

      {open ? (
        <div
          id="site-assistant-panel"
          ref={panelRef}
          data-assistant="panel"
          tabIndex={-1}
          role="dialog"
          aria-modal="false"
          aria-label={SITE_ASSISTANT_LABEL}
          className="fixed bottom-[calc(8rem+env(safe-area-inset-bottom))] right-4 z-[var(--wg-z-popover)] flex max-h-[70vh] w-[min(24rem,calc(100vw-2rem))] flex-col rounded-2xl border border-[var(--gold-light)] bg-[#fcfaf6] shadow-[0_24px_60px_rgba(23,45,82,.24)] outline-none sm:bottom-20"
        >
          <div className="flex items-start justify-between gap-3 border-b border-[var(--gold-light)] px-4 py-3">
            <div>
              <p className="text-lg font-semibold leading-tight text-[var(--navy)]">{SITE_ASSISTANT_LABEL}</p>
              <p className="mt-1 text-[10px] leading-[1.3] text-stone-500">{SITE_ASSISTANT_SUPPORT}</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close the assistant"
              className="-mr-1 -mt-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-stone-500 transition hover:bg-white hover:text-[var(--navy)]"
            >
              <Icon name="close" className="h-4 w-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {thread.turns.length === 0 ? (
              <p className="text-sm leading-6 text-stone-600">
                Ask about a destination, a kever, kosher food or anything else on this site.
              </p>
            ) : null}

            {thread.turns.map((turn, index) => (
              <div key={`${turn.at}-${index}`}>
                {turn.role === "traveler" ? (
                  <p className="ml-auto w-fit max-w-[85%] rounded-2xl bg-[var(--navy)] px-3 py-2 text-sm leading-6 text-white">
                    {turn.text}
                  </p>
                ) : (
                  <div className="w-fit max-w-[92%] rounded-2xl border border-[var(--gold-light)] bg-white px-3 py-2">
                    <p className="whitespace-pre-wrap text-sm leading-6 text-[var(--navy)]">{turn.text}</p>
                    {turn.notCovered ? (
                      <Link
                        href={handOffHref(thread.turns[index - 1]?.text ?? "")}
                        className="mt-2 inline-flex min-h-11 items-center text-xs font-bold uppercase tracking-[0.1em] text-[var(--navy)] underline decoration-[var(--gold)] decoration-2 underline-offset-4"
                      >
                        {HAND_OFF_LABEL}
                      </Link>
                    ) : (
                      <>
                        {turn.sources?.length ? (
                          <ul className="mt-2 space-y-1">
                            {turn.sources.map((source) => (
                              <li key={source.href}>
                                <Link
                                  href={source.href}
                                  className="text-xs font-semibold text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-2"
                                >
                                  {source.title}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--gold-ink)]">
                          {SITE_ANSWER_LABEL}
                        </p>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}

            {busy ? <p className="text-sm text-stone-500">Looking through the site…</p> : null}
            <div ref={endRef} />
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void ask(question);
            }}
            className="border-t border-[var(--gold-light)] px-4 py-3"
          >
            <label className="sr-only" htmlFor="site-assistant-question">
              {SITE_ASSISTANT_LABEL}
            </label>
            <div className="flex items-center gap-2">
              <input
                id="site-assistant-question"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="Kosher food in Antwerp?"
                className="min-h-11 w-full min-w-0 rounded-xl border border-[var(--gold-light)] bg-white px-3 text-sm text-[var(--navy)] outline-none focus:border-[var(--gold)]"
              />
              <button
                type="submit"
                disabled={busy || !question.trim()}
                className="min-h-11 shrink-0 rounded-xl border border-[var(--navy)] bg-[var(--navy)] px-4 text-xs font-bold uppercase tracking-[0.1em] text-white transition hover:border-[var(--gold)] hover:bg-[var(--gold)] disabled:opacity-50"
              >
                Ask
              </button>
            </div>
            <p className="mt-2 text-[11px] leading-4 text-stone-500">{ASSISTANT_INPUT_NOTICE}</p>
            <p className="mt-1 text-[11px] leading-4 text-stone-500">
              {/* THREE STATES, AND EACH ONE SAID PLAINLY. Somebody asking where
                  their family is going in August is entitled to know whether it
                  is being written down, and "signed in" alone no longer answers
                  that — keeping the thread comes with a plan. */}
              {thread.kept
                ? "Saved to your account, so it is here next time."
                : thread.signedIn
                  ? "Not saved — keeping the conversation between visits comes with a plan."
                  : "Not signed in — this conversation is not saved anywhere."}
            </p>
          </form>
        </div>
      ) : null}
    </>
  );
}
