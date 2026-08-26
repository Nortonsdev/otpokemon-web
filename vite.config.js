import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: "client",
  publicDir: "public",
  server: {
    host: true,
    port: 5173,
    fs: { allow: [rootDir] },
    proxy: {
      "/ws": {
        target: "ws://127.0.0.1:3001",
        ws: true,
      },
    },
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
});
