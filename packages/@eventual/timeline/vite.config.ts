import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { NodeGlobalsPolyfillPlugin } from "@esbuild-plugins/node-globals-polyfill";
import rollupNodePolyFill from "rollup-plugin-node-polyfills";
import path from "path";

import { createRequire as topLevelCreateRequire } from "module";
// @ts-ignore
const require = topLevelCreateRequire(import.meta.url);

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    sourcemap: "inline",
    rollupOptions: {
      plugins: [rollupNodePolyFill()],
    },
  },
  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: "globalThis",
      },
      plugins: [NodeGlobalsPolyfillPlugin({ buffer: true })],
    },
  },
  resolve: {
    alias: {
      global: path.join(
        require.resolve("rollup-plugin-node-polyfills"),
        "../../polyfills/global"
      ),
      buffer: path.join(
        require.resolve("rollup-plugin-node-polyfills"),
        "../../polyfills/buffer-es6"
      ),
    },
  },
});
