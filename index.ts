// ============================================================================
// @userfiction/inventory — Package barrel export (root index.ts)
// ============================================================================
// Source-only publish surface (AGENTS.md runner policy (c)): package.json
// main/module/types/exports point straight at ./src/index.ts, so npm consumers
// land on the src barrel directly — there is no dist build and no
// `exports.development` condition any more.
// This root barrel remains the relative-import alias: FORWARDS to the src-level
// public barrel (src/index.ts), which owns the explicit export list — the same
// one-place pattern as @userfiction/combat — so the root alias, the demo's
// relative imports and every test resolve the identical surface without drift.
// ============================================================================

export * from './src/index';
