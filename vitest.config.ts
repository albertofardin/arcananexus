import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
    tsconfigPaths(), // Supports @/* path aliases from tsconfig.json
  ],
  test: {
    name: "arcana-domine",
    environment: "jsdom", // For React component testing
    globals: true, // Allow global test functions (describe, it, expect)
    setupFiles: ["./src/test/setup.ts"], // Global setup file
    include: ["**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules", ".next", "dist", "e2e", ".claude/worktrees"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      exclude: [
        "node_modules/",
        ".next/",
        "src/test/",
        "**/*.config.{ts,js}",
        "**/*.d.ts",
        "prisma/",
        "**/*.test.{ts,tsx}",
        "**/*.spec.{ts,tsx}",
      ],
      include: [
        "src/lib/**/*.ts",
        "src/app/**/*.{ts,tsx}",
        "src/components/**/*.tsx",
      ],
    },
    testTimeout: 10000,
    hookTimeout: 10000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
