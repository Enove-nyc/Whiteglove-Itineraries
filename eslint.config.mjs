import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    /**
     * AN UNDERSCORE IS HOW THIS CODEBASE ALREADY SAYS "DELIBERATELY UNUSED".
     *
     * flightsVia(_env), hechsherStatus(_agencies) and the rest keep a
     * parameter their body no longer reads, so an old call site still
     * compiles and the signature still documents what a caller may pass. The
     * underscore is the convention saying so; the linter simply had not been
     * told to read it, and warning about them invited somebody to "clean up"
     * a parameter that is load-bearing for callers.
     *
     * Only ARGUMENTS and caught errors — an unused local variable is still a
     * warning, because that one really is dead.
     */
    files: ["**/*.{ts,tsx,mjs,cjs,js,jsx}"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // A .cjs FILE IS COMMONJS BY DEFINITION, so require() is not a style
    // choice there — it is the only thing that works. The TypeScript preset
    // bans require() across the repo, which is right for everything Next
    // compiles and wrong for the one-shot Node scripts under scripts/.
    // Converting them to ESM to satisfy a rule aimed at application code
    // would be the tail wagging the dog.
    files: ["**/*.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
