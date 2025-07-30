// eslint.config.js
import { FlatCompat } from "@eslint/eslintrc";
import eslintJs from "@eslint/js";
import tsParser from "@typescript-eslint/parser";

const compat = new FlatCompat();

export default [
  {
    ignores: ['node_modules', 'dist', 'build', 'coverage', 'src/dashboard/dist', 'scripts'],
  },
  eslintJs.configs.recommended,
  ...compat.config({
    ignorePatterns: [
      "dist/**",
      "src/dashboard/dist/**",
      "node_modules/**",
      "eslint.config.ts",
      "vitest.config.ts",
    ],

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
      project: "./tsconfig.eslint.json",
    },
    rules: {
      // Custom rules can go here
      "@typescript-eslint/no-floating-promises": "error",
    },
  }),
];
