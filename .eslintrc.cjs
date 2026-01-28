/** @type {import("eslint").Linter.Config} */
module.exports = {
  root: true,
  extends: ["next/core-web-vitals", "plugin:@typescript-eslint/recommended"],
  ignorePatterns: [
    ".next/",
    "node_modules/",
    "dist/",
    "coverage/",
    "agent-dumps/",
    "public/",
    "supabase/",
    "scripts/",
    "rewrite-imports.js",
    "*.config.js",
    "*.config.cjs",
    "*.config.mjs",
  ],
  rules: {
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/ban-ts-comment": "warn",

    // Let "_" be intentionally-unused without failing lint
    "@typescript-eslint/no-unused-vars": [
      "error",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
    ],
  },
  overrides: [
    {
      // Node/build scripts: allow require + looser TS rules
      files: ["*.js", "*.cjs", "*.mjs"],
      rules: {
        "@typescript-eslint/no-var-requires": "off",
        "@typescript-eslint/no-require-imports": "off",
        "@typescript-eslint/no-unused-vars": "off",
      },
    },
  ],
};