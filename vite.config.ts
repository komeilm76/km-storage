import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: "./src/main.ts",
      name: "Storage",
      fileName: "main",
      formats: ["cjs", "umd", "es"],
    },
    outDir: "./lib",
  },
});
