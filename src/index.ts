// @userfiction/inventory — src-level public barrel.
// Owns the package's explicit export list: the `userInventory` facade
// (createUserInventory / UserInventory) is the configured public surface;
// the copied bag primitives stay internal (implementation detail).
// Instance sidecar types are additive public API (identified units with
// opaque stats — see src/user-inventory.ts).
export { createUserInventory } from './user-inventory';
export type {
    UserInventory,
    ItemStats,
    InventoryInstance,
    InventoryInstances,
} from './user-inventory';
export type { Inventory } from './inventory';
