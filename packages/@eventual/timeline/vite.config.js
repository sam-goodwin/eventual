"use strict";
exports.__esModule = true;
var vite_1 = require("vite");
var plugin_react_1 = require("@vitejs/plugin-react");
var node_globals_polyfill_1 = require("@esbuild-plugins/node-globals-polyfill");
var rollup_plugin_node_polyfills_1 = require("rollup-plugin-node-polyfills");
var path_1 = require("path");
/**
 * Vite runs build from an ES Module.
 */
var module_1 = require("module");
// @ts-ignore
var require = (0, module_1.createRequire)(import.meta.url);
// https://vitejs.dev/config/
exports["default"] = (0, vite_1.defineConfig)({
    plugins: [(0, plugin_react_1["default"])()],
    build: {
        sourcemap: "inline",
        rollupOptions: {
            plugins: [(0, rollup_plugin_node_polyfills_1["default"])()]
        }
    },
    optimizeDeps: {
        exclude: ["@esbuild-plugins/node-globals-polyfill"],
        esbuildOptions: {
            define: {
                global: "globalThis"
            },
            plugins: [
                (0, node_globals_polyfill_1.NodeGlobalsPolyfillPlugin)({ buffer: true }),
                // require due to esbuild bug: https://github.com/remorses/esbuild-plugins/issues/27
                {
                    name: "fix-node-globals-polyfill",
                    setup: function (build) {
                        build.onResolve({ filter: /_(buffer|virtual-process-polyfill_)\.js/ }, function (_a) {
                            var path = _a.path;
                            return ({ path: path });
                        });
                    }
                },
            ]
        }
    },
    resolve: {
        alias: {
            global: path_1["default"].join(require.resolve("rollup-plugin-node-polyfills"), "../../polyfills/global"),
            buffer: path_1["default"].join(require.resolve("rollup-plugin-node-polyfills"), "../../polyfills/buffer-es6")
        }
    }
});
