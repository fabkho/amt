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
    // pi-extension targets the pi runtime — its deps aren't installed here
    ignorePatterns: ["dist", "pi-extension", "assets"],
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
