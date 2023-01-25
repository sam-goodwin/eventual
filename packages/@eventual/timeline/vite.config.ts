import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { NodeGlobalsPolyfillPlugin } from "@esbuild-plugins/node-globals-polyfill";
import rollupNodePolyFill from "rollup-plugin-node-polyfills";
import path from "path";

/**
 * Vite runs build from an ES Module.
 */
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
    exclude: ["@esbuild-plugins/node-globals-polyfill"],
    esbuildOptions: {
      define: {
        global: "globalThis",
      },
      plugins: [
        NodeGlobalsPolyfillPlugin({ buffer: true }),
        {
          name: "fix-node-globals-polyfill",
          setup(build) {
            build.onResolve(
              { filter: /_(buffer|virtual-process-polyfill_)\.js/ },
              ({ path }) => ({ path })
            );
          },
        },
      ],
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
