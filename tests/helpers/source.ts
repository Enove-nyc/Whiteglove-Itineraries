import { readFileSync } from "node:fs";

/**
 * A source file with its comments removed.
 *
 * WHY THIS EXISTS. Several tests here assert that a page does NOT say
 * something — no price written into the pricing page, no "trending" on the
 * front page, no mikvah section in the near-me route. In every one of those
 * files the comment above the code EXPLAINS the rule and names the thing it
 * forbids, so a naive read of the source finds the explanation and reports it
 * as a breach. That mistake was made three separate times before this helper
 * existed.
 *
 * What matters is what reaches the reader. This strips block and line comments
 * and leaves the code. The line-comment pattern deliberately does not fire
 * after a colon, so a URL inside a string survives.
 */
export function codeOf(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}
