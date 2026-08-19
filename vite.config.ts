/// <reference types="vitest/config" />
import { defineConfig } from "vite";

export default defineConfig({
  base: "/voxmetrics-live/",
  worker: { format: "es" },
  test: {
    environment: "node",
  },
});
