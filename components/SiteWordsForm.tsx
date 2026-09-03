"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { BUILT_IN_WORDS, type SiteWords } from "@/data/site-words";
import { FIELDS, type OldSetting, type WordField, WORD_GROUPS, wordProblem } from "@/lib/site-words";
import { resetWordsAction, saveWordsAction } from "@/app/admin/settings/words/actions";

/**
 * The words the website says about itself.
 *
 * EVERY FIELD SAYS WHERE IT SHOWS, and links to the page. That is not decoration:
 * the screen this replaces had six fields, no indication of where any of them
 * appeared, and — as it turned out — none of them appeared anywhere at all.
 * Nobody could have noticed, because nothing on the screen made a claim that
 * could be checked. Naming the place makes the claim checkable in one click.
 */

const input =
  "mt-1.5 w-full rounded-md border border-[var(--gold-light)] bg-white px-3 py-2.5 text-sm text-[var(--navy)] focus:border-[var(--gold)] focus:outline-none focus:ring-2 focus:ring-[var(--gold-light)]";

function ResetButton() {
  const [state, act, busy] = useActionState(resetWordsAction, null);
  return (
    <form action={act} className="flex flex-wrap items-center gap-3">
      <button type="submit" disabled={busy} className="border border-[var(--gold)] px-4 py-3 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)] disabled:opacity-50">
        {busy ? "Putting them back…" : "Back to the built-in wording"}
      </button>
      {state && <span className={`text-sm font-semibold ${state.ok ? "text-emerald-700" : "text-red-700"}`}>{state.message}</span>}
    </form>
  );
}

function Field({ field, value, onChange }: { field: WordField; value: string; onChange: (next: string) => void }) {
  const builtIn = BUILT_IN_WORDS[field.key];
  const changed = value !== builtIn;
  const stillNeedsDecision = field.needsOwnerDecision && value === builtIn;
  return (
    <label className="block">
      <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500">{field.label}</span>
      {stillNeedsDecision && (
        <span className="ml-2 inline-flex items-center rounded-md border border-amber-400 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-amber-900">
          Needs your decision
        </span>
      )}
      {field.long ? (
        <textarea name={field.key} rows={3} value={value} onChange={(e) => onChange(e.target.value)} className={input} />
      ) : (
        <input name={field.key} type="text" value={value} onChange={(e) => onChange(e.target.value)} className={input} />
      )}
      <span className="mt-1 block text-xs leading-5 text-stone-500">
        Shows {field.where} ·{" "}
        <Link href={field.href} target="_blank" className="underline decoration-[var(--gold)] underline-offset-2">
          look at it
        </Link>
      </span>
      {field.guidance && <span className="mt-1 block text-xs leading-5 text-stone-600">{field.guidance}</span>}
      {field.example && stillNeedsDecision && (
        <span className="mt-1 block text-xs leading-5 text-stone-500">
          Example shape (do not copy unless it is true for you): <span className="text-[var(--navy)]">“{field.example}”</span>
        </span>
      )}
      {changed && (
        <span className="mt-1 block text-xs leading-5 text-stone-500">
          Was: <span className="text-[var(--navy)]">“{builtIn}”</span>
        </span>
      )}
    </label>
  );
}

export default function SiteWordsForm({
  current,
  storeReady,
  oldSettings,
}: {
  current: SiteWords;
  storeReady: boolean;
  /** What the previous settings screen had saved and never showed anywhere. */
  oldSettings: OldSetting[];
}) {
  const [state, save, saving] = useActionState(saveWordsAction, null);
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(FIELDS.map((f) => [f.key, current[f.key]])));

  const typed = { ...current } as SiteWords;
  for (const field of FIELDS) Object.assign(typed, { [field.key]: values[field.key] ?? "" });
  const problem = wordProblem(typed);
  const changedCount = FIELDS.filter((f) => typed[f.key] !== BUILT_IN_WORDS[f.key]).length;

  if (!storeReady) {
    return (
      <p className="mt-8 border border-[var(--gold-light)] bg-[#FAF8F3] px-4 py-3 text-sm leading-6 text-stone-600">
        The private store is not connected, so nothing can be changed yet. The site is saying the words it ships with,
        which are shown below each field.
      </p>
    );
  }

  return (
    <>
      {/* Not merged in silently, and not thrown away. He typed these into a
          screen that said it would change the site and it never did; putting
          them live today without being asked would change his front page for a
          decision he made a long time ago and may not remember. */}
      {oldSettings.length > 0 && (
        <section className="mt-8 border border-[var(--gold)] bg-[#FAF8F3] p-6">
          <p className="text-xs font-bold uppercase tracking-[0.17em] text-[var(--gold-ink)]">From the old settings screen</p>
          <h2 className="mt-2 font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">
            {oldSettings.length === 1 ? "One line was" : `${oldSettings.length} lines were`} saved here before, and never shown anywhere
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
            The previous screen saved these and no page on the website read them, so the site kept saying what it always
            said. Nothing has been changed for you — copy anything you still want across, or leave it.
          </p>
          <ul className="mt-4 space-y-3">
            {oldSettings.map((old) => (
              <li key={old.key} className="border-t border-[var(--gold-light)] pt-3 text-sm leading-6">
                <p className="font-semibold text-[var(--navy)]">{old.label}</p>
                <p className="mt-1 text-stone-600">You had typed: “{old.theirs}”</p>
                <p className="text-stone-500">The site is saying: “{old.nowShowing}”</p>
                <button
                  type="button"
                  onClick={() => setValues((v) => ({ ...v, [old.key]: old.theirs }))}
                  className="mt-2 border border-[var(--gold)] px-3 py-2 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--navy)]"
                >
                  Use what I typed
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <form action={save} className="mt-8 space-y-8">
        {WORD_GROUPS.map((group) => (
          <section key={group.id} className="border border-[var(--gold-light)] bg-white p-6">
            <h3 className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">{group.title}</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">{group.note}</p>
            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              {FIELDS.filter((f) => f.group === group.id).map((field) => (
                <Field key={field.key} field={field} value={values[field.key] ?? ""} onChange={(next) => setValues((v) => ({ ...v, [field.key]: next }))} />
              ))}
            </div>
          </section>
        ))}

        {problem && <p className="border border-red-300 bg-red-50 px-4 py-3 text-sm font-semibold leading-6 text-red-700">{problem}</p>}

        <div className="flex flex-wrap items-center gap-4">
          <button type="submit" disabled={saving || Boolean(problem)} className="border border-[var(--navy)] bg-[var(--navy)] px-5 py-3 text-xs font-bold uppercase tracking-[0.12em] text-white disabled:opacity-50">
            {saving ? "Saving…" : "Save these words"}
          </button>
          <span className="text-sm text-stone-600">
            {changedCount === 0
              ? "Nothing differs from the wording the site ships with."
              : `${changedCount} ${changedCount === 1 ? "line differs" : "lines differ"} from the built-in wording.`}
          </span>
          {state && <span className={`text-sm font-semibold ${state.ok ? "text-emerald-700" : "text-red-700"}`}>{state.message}</span>}
        </div>
      </form>

      {/* Outside the form above — a <form> inside a <form> is not valid HTML,
          so the browser drops the inner one and this would submit the save. */}
      <div className="mt-8 border-t border-[var(--gold-light)] pt-6">
        <ResetButton />
      </div>
    </>
  );
}
