"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useFocusTrap } from "@/components/useFocusTrap";
import {
  type AccountPlan,
  MAX_NOTE,
  type PlanRequest,
  PLAN_BLURB,
  PLAN_LABELS,
  plansToAskAbout,
  whatYouGet,
} from "@/lib/account-plans";
import { TRIAL_DAYS } from "@/lib/plan-billing";

/**
 * What kind of account this is, and how to come by a different one.
 *
 * THE RULE THIS PANEL WAS WRITTEN UNDER HAS CHANGED, ON PURPOSE, ONCE. It used
 * to say it must never take money, because nothing on this site did. The owner
 * has since asked for real subscriptions, so there is now one way — and only
 * one — for this panel to be about money: the offering in
 * lib/plan-billing.ts is open AND set to Stripe, which is a thing only he can
 * do, on a screen that refuses the setting until Stripe is genuinely ready.
 *
 * EVERY OTHER PART OF THE OLD RULE STANDS. On the other two settings — and
 * "soon" is what the offering is unless he changes it — this panel takes no
 * card and mentions no card. On "soon" it says plainly that none of them are
 * open and offers to write when one is; on "ask" it does what it always did,
 * which is take a request a person answers. With the offering closed it says
 * nothing about any of them at all.
 *
 * EVERY PLAN READS OUT WHAT IT DOES, AND NONE OF IT IS INVENTED. Each card —
 * the one the traveller is on and each one offered — shows the same two true
 * things: its limits line (`limitsLine`, worked out on the server from the real
 * ceilings) and the extras it unlocks (`whatYouGet`, each with a gate behind it
 * in lib/account-limits.ts). Nothing here is a benefit nobody agreed to keep;
 * the words and the gates are held in step by the tests named on those files.
 */

const inputClass =
  "mt-1.5 w-full rounded-md border border-[var(--gold-light)] bg-white px-3 py-2.5 text-sm text-[var(--navy)] transition focus:border-[var(--gold)] focus:outline-none focus:ring-2 focus:ring-[var(--gold-light)]";
const captionClass = "text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500";

/** One plan the traveller could take up, already resolved on the server. */
export type PlanOffer = {
  plan: AccountPlan;
  /** "$12 a month", or "" when there is nothing certain to say about money. */
  line: string;
  /** The renewal periods available. Empty when nothing is being charged. */
  periods: Array<{ period: "monthly" | "yearly"; line: string }>;
  /** What this plan limits, in the traveller's words, so the card reads out everything it does. */
  limitsLine: string;
  /** A single fee, not a subscription — see lib/plan-billing.ts's ONE_TIME_PLANS. */
  oneTime: boolean;
  /** Worked out on the server from trialEligible in lib/plan-billing.ts. */
  trialEligible: boolean;
};

export default function AccountPlanPanel({
  plan,
  limitsLine,
  usageLine,
  openRequest,
  /**
   * What the owner is offering right now, worked out on the server.
   *
   * `null` means the offering is closed and this panel says nothing at all
   * about other kinds of account — not a greyed-out card, not a "coming soon".
   */
  offer = null,
}: {
  plan: AccountPlan;
  offer?: { how: "soon" | "ask" | "stripe"; choices: PlanOffer[] } | null;
  /**
   * What this plan limits, worked out on the server. A sentence rather than
   * numbers, because it has to read the clock to say when the next printable
   * copy is due and a component may not do that while it renders.
   */
  limitsLine: string;
  /** Where they stand against those limits right now. */
  usageLine: string;
  openRequest: PlanRequest | null;
}) {
  const router = useRouter();
  const [asking, setAsking] = useState<AccountPlan | null>(null);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [leaving, setLeaving] = useState(false);

  // Two filters, both of which have to agree. `plansToAskAbout` is about THEM —
  // never offer somebody what they already have. The offering is about the
  // owner — never offer what he is not offering. Neither is a substitute for
  // the other, and the server checks both again when a button is pressed.
  const offerable = offer?.choices ?? [];
  const choices = plansToAskAbout(plan).filter((choice) => offerable.some((entry) => entry.plan === choice));
  const included = whatYouGet(plan);
  const takingCards = offer?.how === "stripe";
  // Named, not open. Both accounts are shown and neither can be taken; pressing
  // one opens a note saying so and offers to write when it does open.
  const notOpenYet = offer?.how === "soon";
  const dialogRef = useFocusTrap<HTMLDivElement>(notOpenYet && Boolean(asking), () => setAsking(null));

  /** Off to Stripe's own page. Nothing about a card happens on this site. */
  async function subscribe(wanted: AccountPlan, period: "monthly" | "yearly") {
    setSending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/account/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: wanted, period }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.url) {
        setSending(false);
        setMessage({ ok: false, text: data?.error || "That could not be started just now." });
        return;
      }
      // `assign`, not `location.href =`: this leaves the site for Stripe's own
      // page, and the lint rule that forbids writing to an external value is
      // right that a plain assignment is a mutation rather than a navigation.
      window.location.assign(data.url);
    } catch {
      setSending(false);
      setMessage({ ok: false, text: "That could not be started just now." });
    }
  }

  /** Stripe's own portal: change the card, or stop. */
  async function manage() {
    setLeaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/account/billing/portal", { method: "POST" });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.url) {
        setLeaving(false);
        setMessage({ ok: false, text: data?.error || "That could not be opened just now." });
        return;
      }
      // `assign`, not `location.href =`: this leaves the site for Stripe's own
      // page, and the lint rule that forbids writing to an external value is
      // right that a plain assignment is a mutation rather than a navigation.
      window.location.assign(data.url);
    } catch {
      setLeaving(false);
      setMessage({ ok: false, text: "That could not be opened just now." });
    }
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!asking) return;
    setSending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/account/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wanted: asking, note }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage({ ok: false, text: data?.error || "That could not be sent." });
        return;
      }
      setAsking(null);
      setNote("");
      setMessage({
        ok: true,
        text: notOpenYet
          ? "Thank you — we have your name, and we will write to you the day it opens."
          : "Thanks — your request has been sent. We will be in touch.",
      });
      router.refresh();
    } catch {
      // A dropped network never resolved response, so without this the button
      // stayed stuck on "Sending…" forever — matching subscribe()/manage().
      setMessage({ ok: false, text: "That could not be sent just now — check your connection and try again." });
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="mt-10 border border-[var(--gold-light)] bg-[#fcfaf6] p-6 sm:p-8">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--gold-ink)]">Your account</p>
      <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">
        {PLAN_LABELS[plan]}
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-7 text-stone-600">{PLAN_BLURB[plan]}</p>

      {/* Everything this plan does, said the same way for every plan: the
          limits line (which already ends "everything else on the site is the
          same"), then the extras this plan unlocks. An account with no plan
          yet unlocks none, so it is the limits line alone rather than an
          empty heading. */}
      <p className="mt-4 max-w-2xl text-sm leading-7 text-stone-600">{limitsLine}</p>
      {included.length > 0 && (
        <ul className="mt-3 max-w-2xl space-y-1.5 text-sm leading-7 text-stone-600">
          {included.map((line) => (
            <li key={line} className="flex gap-2">
              <span aria-hidden="true" className="text-[var(--gold-ink)]">✓</span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--navy)]">{usageLine}</p>

      {/* A way back down, once upgraded. It opens Stripe's own page — the one
          place a subscription cancels decently — where a member can switch
          plan, cancel, or return to Traveler. Shown for any paid plan, not only
          a live card subscription: somebody the owner put on a plan by hand has
          no Stripe customer and the portal route answers them plainly (write in
          and we sort it out) rather than with an error. */}
      {plan !== "free" && (
        <div className="mt-6">
          <button
            type="button"
            onClick={manage}
            disabled={leaving}
            className="min-h-11 rounded-md border border-[var(--navy)] px-4 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)] transition hover:bg-[var(--navy)] hover:text-white disabled:opacity-50"
          >
            {leaving ? "Opening…" : "Change or cancel your plan"}
          </button>
        </div>
      )}

      {openRequest ? (
        <div className="mt-6 border-l-4 border-[var(--gold)] bg-white px-4 py-3">
          <p className="text-sm leading-7 text-stone-700">
            You asked about <strong>{PLAN_LABELS[openRequest.wanted]}</strong>.{" "}
            {notOpenYet ? "We will write to you the day it opens." : "We will be in touch with the next steps."}
          </p>
        </div>
      ) : choices.length > 0 ? (
        <div className="mt-6">
          <p className="text-sm leading-7 text-stone-600">
            {takingCards
              ? "There are other kinds of account, if one of them fits how you travel."
              : notOpenYet
                ? "Other kinds of account open shortly. Say which one interests you and we will write to you the day it does."
                : "Interested in a different account? Send a request and we will follow up with the available options."}
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {choices.map((choice) => {
              const entry = offerable.find((row) => row.plan === choice);
              return (
                <div key={choice} className="border border-[var(--gold-light)] bg-white p-5">
                  <h3 className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">{PLAN_LABELS[choice]}</h3>
                  <p className="mt-2 text-sm leading-7 text-stone-600">{PLAN_BLURB[choice]}</p>
                  {/* Everything the plan does, the same two true things as the
                      card above: its limits line, then the extras it unlocks. */}
                  {entry?.limitsLine && <p className="mt-3 text-sm leading-7 text-stone-600">{entry.limitsLine}</p>}
                  {whatYouGet(choice).length > 0 && (
                    <ul className="mt-3 space-y-1.5 text-sm leading-7 text-stone-600">
                      {whatYouGet(choice).map((line) => (
                        <li key={line} className="flex gap-2">
                          <span aria-hidden="true" className="text-[var(--gold-ink)]">✓</span>
                          <span>{line}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {/* No price line at all rather than a guessed one. In Stripe
                      mode this comes from Stripe itself, so it is the number
                      that will appear on the card or it is not shown. */}
                  {entry?.line && <p className="mt-3 text-sm font-semibold text-[var(--navy)]">{entry.line}</p>}

                  {takingCards && entry ? (
                    <div className="mt-4">
                      {entry.trialEligible && (
                        <p className="mb-2 text-xs font-semibold text-[var(--gold-ink)]">
                          Free for {TRIAL_DAYS} days, then billed — cancel any time before that and nothing is charged.
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2">
                        {entry.periods.map((option) => (
                          <button
                            key={option.period}
                            type="button"
                            onClick={() => subscribe(choice, option.period)}
                            disabled={sending}
                            className="min-h-11 rounded-md border border-[var(--navy)] bg-[var(--navy)] px-4 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:bg-[var(--gold)] hover:text-[var(--navy)] disabled:opacity-50"
                          >
                            {sending
                              ? "One moment…"
                              : entry.oneTime
                                ? `Buy — ${option.line}`
                                : entry.trialEligible
                                  ? `Start free trial — then ${option.line}`
                                  : entry.periods.length > 1
                                    ? `${option.period === "yearly" ? "Yearly" : "Monthly"} — ${option.line}`
                                    : `Subscribe — ${option.line}`}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setAsking(asking === choice ? null : choice);
                        setMessage(null);
                      }}
                      aria-expanded={asking === choice}
                      className="mt-4 min-h-11 rounded-md border border-[var(--navy)] bg-[var(--navy)] px-4 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:bg-[var(--gold)] hover:text-[var(--navy)]"
                    >
                      {asking === choice
                        ? "Never mind"
                        : notOpenYet
                          ? `Tell me when ${PLAN_LABELS[choice]} opens`
                          : `Ask about ${PLAN_LABELS[choice]}`}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {takingCards && (
            <p className="mt-4 text-xs leading-6 text-stone-500">
              Payment is handled by Stripe on their own page. You can stop it whenever you like, and the trips you have
              made stay yours either way.
            </p>
          )}

          {asking && !notOpenYet && (
            <form onSubmit={send} className="mt-5 border border-[var(--gold)] bg-white p-5">
              <p className="text-sm leading-7 text-stone-600">
                Asking about <strong className="text-[var(--navy)]">{PLAN_LABELS[asking]}</strong>.
              </p>
              <label className="mt-4 block">
                <span className={captionClass}>Anything you want to say (optional)</span>
                <textarea
                  className={`${inputClass} min-h-24`}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={MAX_NOTE}
                  placeholder="What you are hoping for"
                />
              </label>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={sending}
                  className="min-h-11 rounded-md bg-[var(--navy)] px-5 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:bg-[var(--gold)] disabled:opacity-50"
                >
                  {sending ? "Sending…" : "Send it"}
                </button>
                <span className="text-xs text-stone-400">We will reply with the next steps.</span>
              </div>
            </form>
          )}

          {/* The same request, as a note over the page, while the accounts are
              named and not open.
              WHY A DIALOG RATHER THAN THE INLINE FORM. Somebody pressing a
              button expects to get the thing. Here they cannot, and the reason
              has to arrive before anything else does — a form quietly appearing
              below the fold would read as the sign-up they asked for and the
              refusal would be the small print. */}
          {asking && notOpenYet && (
            <div
              className="fixed inset-0 z-[var(--wg-z-modal,200)] flex items-end justify-center bg-[var(--navy)]/50 p-4 backdrop-blur-[2px] sm:items-center"
              onClick={(event) => {
                if (event.target === event.currentTarget) setAsking(null);
              }}
            >
              <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="plan-soon-title"
                className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-[var(--gold-light)] bg-white p-6 shadow-[0_24px_60px_rgba(23,45,82,.20)] sm:p-8"
              >
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--gold-ink)]">
                  {PLAN_LABELS[asking]}
                </p>
                <h3
                  id="plan-soon-title"
                  className="mt-2 font-[family-name:var(--font-display)] text-2xl leading-tight text-[var(--navy)]"
                >
                  {PLAN_LABELS[asking]} opens shortly
                </h3>
                <p className="mt-3 text-sm leading-7 text-stone-600">{PLAN_BLURB[asking]}</p>
                <p className="mt-3 text-sm leading-7 text-stone-600">
                  It is not open for sign-ups yet. Leave your name on it and we will write to you the day it is —
                  nothing is charged and there is nothing to cancel.
                </p>

                <form onSubmit={send} className="mt-5">
                  <label className="block">
                    <span className={captionClass}>What you are hoping for (optional)</span>
                    <textarea
                      className={`${inputClass} min-h-24`}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      maxLength={MAX_NOTE}
                      placeholder="How many trips you plan, who for"
                    />
                  </label>
                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <button
                      type="submit"
                      disabled={sending}
                      className="min-h-11 rounded-md bg-[var(--navy)] px-5 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:bg-[var(--gold)] disabled:opacity-50"
                    >
                      {sending ? "Sending…" : "Write to me when it opens"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAsking(null)}
                      className="px-4 py-3 text-xs font-bold uppercase tracking-[0.12em] text-stone-500 transition hover:text-[var(--navy)]"
                    >
                      Not now
                    </button>
                  </div>
                  {message && !message.ok && (
                    <p className="mt-3 text-sm font-semibold text-red-700">{message.text}</p>
                  )}
                </form>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {message && (
        <p className={`mt-4 text-sm font-semibold ${message.ok ? "text-emerald-700" : "text-red-700"}`}>{message.text}</p>
      )}
    </section>
  );
}
