import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: { "/api": { target: "http://localhost:8787", changeOrigin: false } },
    fs: { allow: [".."] },
  },
  // maplibre runs its tile parser in a module worker
  worker: { format: "es" },
  build: { target: "es2022", sourcemap: true, chunkSizeWarningLimit: 2500 },
});
