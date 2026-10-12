// The userInventory facade — configures the copied bag primitives behind a
// bound controller. `createUserInventory(original)` closes over the ORIGINAL
// json object and every method mutates it in place: no wrapper state, no
// copies — the caller's object IS the inventory.
//
//     const bag = { wood: 2 };
//     const userInventory = createUserInventory(bag);
//     userInventory.add('wood', 3);   // bag is now { wood: 5 }
//     userInventory.remove('wood', 2); // bag is now { wood: 3 }
//
import { inventoryAdd, inventoryRemove, type Inventory } from './inventory';

/** The controller returned by `createUserInventory`, bound to one bag. */
export type UserInventory = {
    /**
     * Adds `count` (default 1) of `item` to the original object and returns
     * the controller for chaining.
     */
    add: (item: string, count?: number) => UserInventory;
    /**
     * Removes `count` (default 1) of `item` from the original object.
     * Atomic: when the bag cannot afford it, nothing changes and `false`
     * is returned — never a partial removal.
     */
    remove: (item: string, count?: number) => boolean;
};

/** Creates a `userInventory` controller operating on the ORIGINAL object. */
export const createUserInventory = (original: Inventory): UserInventory => {
    const controller: UserInventory = {
        add: (item, count = 1) => {
            inventoryAdd(original, item, count);
            return controller;
        },
        remove: (item, count = 1) => inventoryRemove(original, item, count),
    };
    return controller;
};
