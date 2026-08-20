import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: ["src/index.ts", "src/bin.ts", "src/mcp-bin.ts"],
    format: "esm",
    target: "node22",
    clean: true,
    dts: true,
    sourcemap: true,
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
  fmt: {},
  lint: {
    categories: {
      correctness: "error",
      suspicious: "warn",
    },
    rules: {
      "no-console": "error",
      "vite-plus/prefer-vite-plus-imports": "error",
    },
    overrides: [
      {
        files: ["src/utils/logger.ts"],
        rules: {
          "no-console": "off",
        },
      },
    ],
    ignorePatterns: ["dist"],
    options: {
      typeAware: true,
      typeCheck: true,
    },
    jsPlugins: [
      {
        name: "vite-plus",
        specifier: "vite-plus/oxlint-plugin",
      },
    ],
  },
});
