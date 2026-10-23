// @userfiction/inventory — src-level public barrel.
// Owns the package's explicit export list. This package now owns the ENTIRE
// old @userfiction/core inventory API alongside the facade:
// - the ten pure bag primitives + the Inventory type (src/inventory.ts —
//   moved from packages/userfiction/core/inventory/inventory.ts, removed);
// - the `basicInventory` accessor (src/basic-inventory.ts — moved from
//   packages/userfiction/core/inventory/basic-inventory.ts, removed);
// - the `userInventory` facade (createUserInventory / UserInventory) —
//   the configured public surface, unchanged;
// - instance sidecar types (identified units with opaque stats — see
//   src/user-inventory.ts).
export {
    inventoryCount,
    inventoryAdd,
    inventoryRemove,
    inventoryEntries,
    inventoryTotal,
    inventoryFits,
    inventoryHas,
    inventoryAffords,
    inventoryTransfer,
    inventoryExchange,
} from './inventory';
export { basicInventory } from './basic-inventory';
export { createUserInventory } from './user-inventory';
export type {
    UserInventory,
    ItemStats,
    InventoryInstance,
    InventoryInstances,
} from './user-inventory';
export type { Inventory } from './inventory';
