import path from "path";
import { fileURLToPath } from "url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// Fix: Define __dirname manually as it is not available in ES module scope
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");

  // Check for legacy build flag
  const isLegacyBuild = process.env.VITE_LEGACY_BUILD === "true";

  return {
    base: "./",
    server: {
      port: 3000,
      host: "0.0.0.0",
      strictPort: true,
    },
    build: {
      // Use es2017 for High Sierra compatibility, otherwise es2022
      target: isLegacyBuild ? "es2017" : "es2022",
    },
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "."),
      },
    },
  };
});
