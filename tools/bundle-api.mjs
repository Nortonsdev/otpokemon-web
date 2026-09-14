import * as esbuild from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

await esbuild.build({
  absWorkingDir: root,
  entryPoints: [path.join(root, "server/index.js")],
  outfile: path.join(root, "server-bundle/index.js"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  packages: "external",
  sourcemap: true,
  logLevel: "info",
  banner: {
    js: '// Bundled OTPokemon server (no TypeScript at runtime).\n',
  },
});

console.log("server-bundle/index.js ready");
