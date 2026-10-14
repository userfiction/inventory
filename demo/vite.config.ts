// ============================================================================
// demo/vite.config.ts — standalone Vite config for the vanilla demo app
// ============================================================================
// - `root: __dirname` keeps the demo fully isolated from the library config
//   (packages/userfiction/inventory/vite.config.ts is untouched). The
//   __dirname usage mirrors the package's own vite.config.ts and the sibling
//   @userfiction/combat demo (verified against Vite 8 + "type": "module").
// - Port policy: default 8310 (combat's demo uses 8300 so both can run at
//   once in the workspace), strictPort (fail fast instead of silently
//   shifting). Override via env INVENTORY_DEMO_PORT=8400 or Vite CLI
//   `-- --port 8400` — the CLI wins because Vite CLI args override config.
// - Build lands in demo/dist, sourcemapped, mirroring the library build's
//   sourcemap/emptyOutDir choices.
// - No backend, no fetch, no storage: this is a pure static app.
// ----------------------------------------------------------------------------
import { defineConfig } from 'vite';

// Strict env parsing: a present-but-malformed INVENTORY_DEMO_PORT fails
// loudly (strictPort philosophy applied to the override itself); empty
// string = unset.
const rawPort = process.env.INVENTORY_DEMO_PORT;
if (rawPort) {
    if (!/^\d+$/.test(rawPort)) {
        throw new Error(`INVENTORY_DEMO_PORT must be a plain integer port, got: '${rawPort}'`);
    }
}
const port = rawPort ? Number(rawPort) : 8310;

export default defineConfig({
    root: __dirname,
    server: {
        port,
        strictPort: true, // occupied port must fail loudly
    },
    preview: {
        // demo:preview uses the same env/default
        port,
        strictPort: true,
    },
    build: {
        outDir: 'dist', // -> demo/dist
        emptyOutDir: true,
        sourcemap: true,
    },
});
