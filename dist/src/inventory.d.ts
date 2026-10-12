/** An inventory: item id → count. Counts are always integers ≥ 0. */
export type Inventory = Record<string, number>;
/** How many of `item` are held (0 when absent). */
export declare const inventoryCount: (inventory: Inventory, item: string) => number;
/** Adds `count` of `item` (mutates + returns the inventory for chaining). */
export declare const inventoryAdd: (inventory: Inventory, item: string, count: number) => Inventory;
/**
 * Removes `count` of `item`. When the inventory cannot afford it, nothing
 * changes and `false` is returned — never a partial removal.
 */
export declare const inventoryRemove: (inventory: Inventory, item: string, count: number) => boolean;
/** Non-zero entries as a list of stacks. */
export declare const inventoryEntries: (inventory: Inventory) => Array<{
    item: string;
    count: number;
}>;
/**
 * The inventory's total UNITS across every stack — the measure inventory
 * SIZE is counted in (a bird's 3-unit beak holds three berries or one
 * berry and two shells; stacks are not the unit, things are).
 */
export declare const inventoryTotal: (inventory: Inventory) => number;
/**
 * Whether adding a bundle of items still fits an inventory of the given
 * capacity. `Infinity` capacity (no entity profiles mounted) always fits.
 * Pure read — the caller decides whether the add happens at all.
 */
export declare const inventoryFits: (inventory: Inventory, additions: Inventory, capacity: number) => boolean;
/** Whether the inventory holds at least `count` of `item`. */
export declare const inventoryHas: (inventory: Inventory, item: string, count?: number) => boolean;
/**
 * Whether the inventory can afford every stack in a bundle.
 * Accounts for repeated item ids across the bundle (e.g. two entries of
 * 'wood' in the same offer must sum).
 */
export declare const inventoryAffords: (inventory: Inventory, bundle: Inventory) => boolean;
/**
 * Moves `count` of `item` from one inventory to another.
 * Atomic: when the source cannot afford it, neither side changes.
 */
export declare const inventoryTransfer: (from: Inventory, to: Inventory, item: string, count: number) => boolean;
/**
 * The exchange primitive — the heart of "one inventory can exchange items
 * with another". `giver` hands over `offer` and receives `request` from
 * `receiver`. Fully atomic: if either side cannot afford its part, both
 * inventories stay exactly as they were and `false` is returned.
 */
export declare const inventoryExchange: (giver: Inventory, receiver: Inventory, offer: Inventory, request: Inventory) => boolean;
