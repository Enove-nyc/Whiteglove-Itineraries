import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BRAND_ORIGIN } from "@/lib/site-brand-core";

export const dynamic = "force-static";

/** The same public guide, prerendered once, without sessions or database reads. */
export function GET() {
  return new Response(readFileSync(join(process.cwd(), "public/llms.txt"), "utf8"), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Vary": "Accept",
      "Link": `<${BRAND_ORIGIN.itineraries}/>; rel="canonical"`,
    },
  });
}
