import { existsSync, readdirSync, readFileSync } from "node:fs";
if (existsSync("journey-results")) for (const dir of readdirSync("journey-results")) {
  const path = "journey-results/" + dir + "/report.json";
  if (!existsSync(path)) continue;
  const report = JSON.parse(readFileSync(path, "utf8"));
  console.log("RUNTIME_BROWSER_RESULT", JSON.stringify({ brand: report.brand, passed: report.scenarios.filter(s => s.status === "passed").length, failed: report.scenarios.filter(s => s.status !== "passed"), errors: report.errors, accessibility: report.accessibility.flatMap(s => s.violations) }));
}
