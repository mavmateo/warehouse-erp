/** @type {import("eslint").Linter.Config} */
module.exports = {
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:import/recommended",
    "plugin:import/typescript",
    "prettier",
  ],
  plugins: ["@typescript-eslint", "import"],
  parser:  "@typescript-eslint/parser",
  rules: {
    "@typescript-eslint/no-explicit-any":      "warn",
    "@typescript-eslint/no-unused-vars":        ["error", { argsIgnorePattern: "^_" }],
    "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
    "import/order": ["error", {
      "groups":               ["builtin","external","internal","parent","sibling","index"],
      "newlines-between":     "always",
      "alphabetize":          { order: "asc", caseInsensitive: true },
    }],
    "no-console": ["warn", { allow: ["warn", "error"] }],
  },
  ignorePatterns: ["dist/", "node_modules/", "*.config.js"],
};
