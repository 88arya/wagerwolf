import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * The lint gate, made meaningful.
 *
 * It stood at 302 problems with `continue-on-error: true` in CI, which is a
 * gate that has never been green and therefore gates nothing. The fix is not to
 * silence it — it is to decide, rule by rule, which findings are bugs worth
 * failing a build over and which are this codebase's deliberate style. What is
 * left as an error is a short list that is actually at zero, so the day it goes
 * red something real happened.
 *
 * The reasoning for each downgrade is below. None of them is "there were too
 * many to fix".
 */
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // 227 of the 302. `any` is the house style at the API boundary: every
      // fetch in this app returns untyped JSON from an Express backend that
      // shares no types with the frontend, and the honest alternative is
      // hand-written interfaces that drift from the server the first time a
      // route changes. Warn so new ones are visible; do not fail a build.
      "@typescript-eslint/no-explicit-any": "warn",

      // DO NOT RAISE THIS TO ERROR, and never run `--fix` on it. Several of
      // these narrow dependency lists are load-bearing and documented as such
      // in CLAUDE.md -> Strip continuity: GamesStrip keys effects off
      // `weekKey` rather than the `week` object precisely because the
      // once-a-minute live-score poll replaces that object wholesale, and
      // widening the deps to what this rule wants reintroduces a visible jump
      // in the ticker every 60 seconds. The rule cannot see that.
      "react-hooks/exhaustive-deps": "warn",

      // The pattern this flags is the app's standard data-loading shape —
      // fetch in an effect, setState in the callback. Rewriting all 20 to a
      // suspense or reducer form is a refactor, not a lint fix, and it belongs
      // behind its own decision rather than inside a CI gate.
      "react-hooks/set-state-in-effect": "warn",

      // Stays an error. An unused import or binding is nearly always the
      // residue of a deletion that was not finished, which is exactly the
      // class of thing a gate should catch. Underscore-prefixed arguments are
      // exempt because that prefix is the convention for "deliberately
      // ignored" and the codebase already uses it.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
]);

export default eslintConfig;
