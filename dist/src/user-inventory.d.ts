import { type Inventory } from './inventory';
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
export declare const createUserInventory: (original: Inventory) => UserInventory;
