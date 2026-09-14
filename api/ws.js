/**
 * Vercel Function entry — HTTP + WebSocket world.
 * Imports the esbuild bundle produced by `npm run build` (`tools/bundle-api.mjs`)
 * so the serverless runtime never has to load TypeScript.
 */
export { default, server } from "../server-bundle/index.js";
