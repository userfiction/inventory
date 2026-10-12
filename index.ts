// ============================================================================
// @userfiction/inventory — Package barrel export (root index.ts)
// ============================================================================
// Public npm entrypoint (package.json exports.development + vite lib.entry).
// FORWARDS to the src-level public barrel (src/index.ts), which owns the
// explicit export list — the same one-place pattern as @userfiction/combat:
// the root entry, relative imports and every test resolve the identical
// surface without drift.
// ============================================================================

export * from './src/index';
