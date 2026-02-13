import path from "path";
import { fileURLToPath } from "url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

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
      // Use safari11 for High Sierra compatibility, otherwise es2022
      target: isLegacyBuild ? "safari11" : "es2022",
      cssTarget: isLegacyBuild ? "safari11" : undefined,
    },
    css: {
      // Lightning CSS is the modern way to transpile for old browsers in Vite
      transformer: 'lightningcss',
      lightningcss: {
        targets: isLegacyBuild ? {
          safari: (11 << 16), // Safari 11.0.0 (High Sierra)
        } : undefined,
      }
    },
    plugins: [
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "."),
      },
    },
  };
});
