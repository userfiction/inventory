// Basic Inventory Control — the fiction-side lazy accessor factory, moved
// verbatim from packages/userfiction/core/inventory/basic-inventory.ts
// (core no longer ships any inventory API; @userfiction/inventory now owns
// BOTH shapes — src/inventory.ts holds the pure Record<item, count> bag
// primitives).
// Provides a factory that creates accessor functions for inventory items stored in a shared data object.
// Each item is keyed by its id and lazily initialized with amount 0 and name matching the id when first accessed.
// name() and amount() act as both getters (no args) and setters (with args).

import { objectHasKey } from '@presource/core';

// The shared data structure stores inventory entries keyed by item id.
// Each entry contains a `name` string and an `amount` number.
type InventoryData = Record<string, { name: string; amount: number }>;

// Returns a lookup function: given an item id, returns an accessor object with name() and amount().
// The shared `data` object is mutated in-place so all holders see the same state.
export const basicInventory = (data: InventoryData) => {
    // The returned function accepts an item id and returns an accessor for that item.
    return (id: string) => {
        // Lazily initialize the item in the shared data if it does not yet exist.
        // Default name matches the id, default amount is 0.
        if (!objectHasKey(data, id)) {
            data[id] = { name: id, amount: 0 };
        }

        return {
            // Getter/setter for name: no args returns current name, string arg sets it.
            // When no name has been explicitly set, the default is the item's id.
            name: (value?: string) => {
                if (value !== undefined) {
                    data[id].name = value;
                }
                return data[id].name;
            },
            // Getter/setter for amount: no args returns current amount, number arg sets it.
            amount: (value?: number) => {
                if (value !== undefined) {
                    data[id].amount = value;
                }
                return data[id].amount;
            },
        };
    };
};
