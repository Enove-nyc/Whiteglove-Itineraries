/**
 * What the assistant is allowed to claim, and how its answers are labelled.
 *
 * THE POINT OF THIS FILE. The assistant writes prose that looks exactly like
 * prose a person wrote. Everywhere else on this site, a practical detail
 * carries a source and a date because somebody checked it; an AI answer
 * carries neither. A visitor cannot tell those apart by looking, so the
 * difference has to be stated — on the control that opens it, beside the box
 * they type into, and on every answer that comes back.
 *
 * The strings are here rather than in the component so the same words appear
 * wherever the assistant does, and so a test can hold them.
 */

/** The one-line warning beside the input. */
export const ASSISTANT_INPUT_NOTICE = "AI-generated. Check important travel details before relying on them.";

/** On every answer, without exception. */
export const ANSWER_LABEL = "AI-generated · Check important details";

/**
 * Shown as well when the answer cites a published page.
 *
 * It says the INFORMATION came from published pages. It does not say this
 * answer was read by anybody, because it wasn't — which is why the label
 * above stays on the same answer.
 */
export const SOURCED_LABEL = "Based on published White Glove information";

/** The homepage door and what it promises. */
export const ASSISTANT_HOME_LABEL = "Ask the AI travel assistant";
export const ASSISTANT_HOME_SUPPORT =
  "Get ideas and help exploring the site. Answers are AI-generated — check important details before relying on them.";

/**
 * Claims the assistant is not entitled to make.
 *
 * A model asked not to say "White Glove recommends" will still occasionally
 * say it, and a prompt is not a guarantee. These are the phrases that would
 * put the site's name behind a sentence nobody read, so they are removed
 * server-side rather than left to the model's good behaviour.
 */
const FALSE_ATTRIBUTION = [
  /\bwhite\s+glove\s+(?:has\s+)?(?:recommends?|recommended|suggests?|advises?|verifies|verified|confirms?|confirmed|approves?|approved|checked|vouches)\b/i,
  /\bwhite\s+glove[-\s]verified\b/i,
  /\bverified\s+by\s+white\s+glove\b/i,
  /\breviewed\s+(?:and\s+approved\s+)?by\s+white\s+glove\b/i,
  /\bwe\s+(?:have\s+)?(?:verified|confirmed|checked|inspected|vetted)\b/i,
  /\bour\s+(?:expert|experts|team|staff|researchers?)\s+(?:say|says|said|recommend|recommends|confirm|confirms)\b/i,
];

/** Whether one sentence claims White Glove stands behind it. */
export function claimsWhiteGloveReview(sentence: string): boolean {
  return FALSE_ATTRIBUTION.some((rule) => rule.test(sentence));
}

/**
 * Remove sentences that put White Glove's name behind the model's words.
 *
 * Sentences, not phrases: rewriting mid-sentence produces mangled English, and
 * a sentence whose whole point is a false claim of review has nothing left
 * worth keeping once the claim is gone. Everything else survives untouched.
 */
export function stripFalseAttribution(answer: string): { text: string; removed: number } {
  let removed = 0;
  const lines = answer.split("\n").map((line) => {
    if (!line.trim()) return line;
    // Split on sentence ends, keeping the punctuation with its sentence.
    const parts = line.split(/(?<=[.!?])\s+/);
    const kept = parts.filter((part) => {
      if (!claimsWhiteGloveReview(part)) return true;
      removed += 1;
      return false;
    });
    return kept.join(" ");
  });
  // A list item emptied of its only sentence leaves a stray bullet behind.
  const text = lines
    .filter((line, index) => !(removed > 0 && /^\s*(?:[-*•]|\d+[.)])\s*$/.test(line) && index > 0))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { text, removed };
}

export type AssistantSource = { title: string; href: string };

/**
 * Which of the published pages we offered the model does the answer actually
 * cite?
 *
 * Read from the answer rather than asked of the model: "did you use our
 * pages?" is a question a model will happily answer yes to. A path it printed
 * is a fact about the text in front of us, so "Based on published White Glove
 * information" appears only when the answer really points at one.
 */
export function citedSources(answer: string, candidates: AssistantSource[]): AssistantSource[] {
  const text = answer.toLowerCase();
  const seen = new Set<string>();
  const found: AssistantSource[] = [];
  for (const candidate of candidates) {
    const href = candidate.href.toLowerCase();
    if (!href.startsWith("/") || href.length < 2) continue;
    if (seen.has(href)) continue;
    // Followed by a boundary, so /kosher does not match /kosher-travel.
    const pattern = new RegExp(`${href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z0-9-])`, "i");
    if (pattern.test(text)) {
      seen.add(href);
      found.push(candidate);
    }
  }
  return found;
}
