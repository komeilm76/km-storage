import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: "./src/main.ts",
      name: "Counter",
      fileName: "main",
    },
    outDir: "./lib",
  },
});
