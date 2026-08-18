import { defineConfig } from "vite";

export default defineConfig({
  root: "client",
  publicDir: "public",
  server: {
    host: true,
    port: 5173,
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
