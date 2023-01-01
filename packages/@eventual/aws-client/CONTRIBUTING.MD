## ESM

This package supports both ESM and CommonJS.

1. Have separate `tsconfig*.json` files, one for esm and one for cjs. These output to `lib/esm` and `lib/cjs` respectively.
2. Define `exports` in `package.json` to allow `esbuild` and other tools that support `conditions` to pick the right path.
3. Define `main` and `module` in `package.json` to allow for legacy tools (ex: older versions of `typescript`) to find the right path.
4. Place a `package.json` with `type:module` set into `lib/esm` to support node natively running an esm module. Node only seems to use the `type` field, unlike typescript and esbuild when running.