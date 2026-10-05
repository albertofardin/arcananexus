// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from "eslint-plugin-storybook";

import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import prettierConfig from "eslint-config-prettier";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  prettierConfig,
  {
    rules: {
      // TypeScript specific rules
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "warn",

      // React specific rules
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
      "react/no-unescaped-entities": "off",
      "react/prop-types": "off",

      // Next.js specific rules
      "@next/next/no-html-link-for-pages": "error",

      // General code quality
      "no-console": "off",
      "prefer-const": "error",
      "no-var": "error",
      eqeqeq: "off",
      "no-duplicate-imports": "error",

      // Code style (handled by Prettier mostly)
      quotes: "off", // Let Prettier handle this
      semi: "off", // Let Prettier handle this

      "react/no-children-prop": "off",
      "import/no-anonymous-default-export": "off",
      "import/named": "error",
      "react/jsx-no-bind": "off",
      "react/display-name": "off",
      "react-hooks/exhaustive-deps": "error",
      "react-hooks/rules-of-hooks": "error",
      "import/no-named-as-default": "off",
      "jsx-a11y/no-autofocus": "off",
      "jsx-a11y/media-has-caption": "off",
      "react/react-in-jsx-scope": "off",
      "no-bitwise": "off",
      "@next/next/no-img-element": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "import/order": ["error", { "newlines-between": "never" }],
    },
  },
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "out/**",
      "public/**",
      "build/**",
      "dist/**",
      "coverage/**",
      ".cache/**",
      ".claude/worktrees/**",
      "storybook-static/**",
      "*.config.js",
      "*.config.mjs",
      "*.config.ts",
    ],
  },
  ...storybook.configs["flat/recommended"],
];

export default eslintConfig;
