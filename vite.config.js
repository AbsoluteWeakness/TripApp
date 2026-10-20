import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./frontend/src/test/setup.js"],
    restoreMocks: true,
    coverage: {
      include: ["frontend/src/**/*.{js,jsx}"],
      exclude: ["frontend/src/**/*.test.{js,jsx}", "frontend/src/test/**"],
      reporter: ["text", "html"],
    },
  },
});
