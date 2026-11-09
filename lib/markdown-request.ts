/** Content negotiation, never a user-agent or authentication exception. */
export function prefersMarkdown(accept: string | null): boolean {
  const types = (accept ?? "").toLowerCase().split(",").map((entry) => {
    const [type, ...parameters] = entry.trim().split(";");
    const parameter = parameters.map((p) => p.trim()).find((p) => p.startsWith("q="));
    const q = parameter ? Number(parameter.slice(2)) : 1;
    return { type, q: Number.isFinite(q) && q >= 0 && q <= 1 ? q : 0 };
  });
  // A browser's */* does not request a different representation.
  const markdown = Math.max(0, ...types.filter((t) => t.type === "text/markdown").map((t) => t.q));
  const html = types.find((t) => t.type === "text/html")?.q
    ?? types.find((t) => t.type === "text/*")?.q
    ?? types.find((t) => t.type === "*/*")?.q ?? 0;
  return markdown > 0 && markdown >= html;
}
