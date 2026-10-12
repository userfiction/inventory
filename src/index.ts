// @userfiction/inventory — src-level public barrel.
// Owns the package's explicit export list: the `userInventory` facade
// (createUserInventory / UserInventory) is the configured public surface;
// the copied bag primitives stay internal (implementation detail).
export { createUserInventory } from './user-inventory';
export type { UserInventory } from './user-inventory';
export type { Inventory } from './inventory';
