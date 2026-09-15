import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

const htmlNoStoreHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
};

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
      "/api": {
        target: "http://127.0.0.1:3001",
      },
    },
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve(rootDir, "client/index.html"),
        editor: path.resolve(rootDir, "client/editor.html"),
      },
    },
  },
  plugins: [
    {
      name: "html-document-no-store-dev",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const url = req.url?.split("?")[0] ?? "";
          if (url === "/" || url.endsWith(".html")) {
            for (const [key, value] of Object.entries(htmlNoStoreHeaders)) {
              res.setHeader(key, value);
            }
          }
          next();
        });
      },
    },
  ],
});
