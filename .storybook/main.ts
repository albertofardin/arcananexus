import type { StorybookConfig } from "@storybook/nextjs-vite";

const config: StorybookConfig = {
  stories: ["../src/components/**/*.stories.@(js|jsx|ts|tsx|mdx)"],
  addons: [],
  framework: "@storybook/nextjs-vite",
  staticDirs: ["../public"],
};
export default config;
