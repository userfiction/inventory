// Vite config for @userfiction/inventory.
// SOURCE-ONLY LIBRARY (repo policy: AGENTS.md "Runtime / runner policy" (c)):
// this package publishes TypeScript from source — package.json main/module/
// types/exports all point at ./src/index.ts, so there is NO library build here
// and no dist/ output. Consumers are Vite-based and compile/roll up the TS from
// node_modules themselves; package.json has no "build"/"prepack" scripts.
// The demo app (demo/) is a DEPLOYABLE surface, not a library build: it keeps
// its own Vite config and dist output via "dev" / "demo:build" /
// "demo:preview" -> demo/vite.config.ts (that file is standalone; it does not
// extend this one).
// - TEST: this file is the vitest config when vitest runs with this package as
//   cwd (package.json "test": "vitest run"), so the root's test settings
//   (jsdom + globals) are mirrored here.
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        // Mirrors root vitest.config.ts so `vitest run` from this package dir
        // behaves exactly as before this config existed
        environment: 'jsdom',
        globals: true,
        include: ['**/*.{test,spec}.{ts,tsx,js,jsx}'],
        passWithNoTests: true,
    },
});
