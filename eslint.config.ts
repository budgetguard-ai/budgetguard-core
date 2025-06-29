// eslint.config.js
import { FlatCompat } from "@eslint/eslintrc";
import eslintJs from "@eslint/js";
import tsParser from "@typescript-eslint/parser";

const compat = new FlatCompat();

export default [
  eslintJs.configs.recommended,
  ...compat.config({
    ignorePatterns: ["dist/**", "node_modules/**", "eslint.config.ts"],

    extends: [
      "plugin:@typescript-eslint/recommended",
      "plugin:prettier/recommended",
    ],
    plugins: ["@typescript-eslint"],
    parser: "@typescript-eslint/parser",
    // Removed 'files' property as it is not valid in this context
    parserOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: "module",
      project: "./tsconfig.json",
    },
    rules: {
      // Custom rules can go here
      "@typescript-eslint/no-floating-promises": "error",
    },
  }),
];
