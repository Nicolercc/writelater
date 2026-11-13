// ESLint flat config for WriteLater. Run: pnpm --filter @workspace/writelater run lint
import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "test-results/**",
      "playwright-report/**",
      // Generated shadcn/ui primitives and their hooks; not edited by hand.
      "src/components/ui/**",
      "src/hooks/use-mobile.tsx",
      "src/hooks/use-toast.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}", "e2e/**/*.ts", "sw/**/*.ts", "*.ts"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      // The classic hook rules catch real bugs (conditional hooks, stale
      // dependencies). The plugin's React Compiler rules (refs,
      // set-state-in-effect, ...) assume the compiler, which this app doesn't
      // use, and report false positives on refs read inside event handlers.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
    },
  },
  {
    // Build-time and test-runner code runs in Node.
    files: ["sw/plugin.ts", "*.config.ts", "e2e/**/*.ts"],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // The service worker template runs in a worker, with placeholders the build fills.
    files: ["sw/service-worker.js"],
    languageOptions: {
      sourceType: "script",
      globals: { ...globals.serviceworker, __PRECACHE__: "readonly" },
    },
  },
);
