// userInventory facade tests — the controller binds the ORIGINAL json
// object: every add/remove mutates that exact object in place, no wrapper
// state, no copies. Exact-value assertions throughout.
import { createUserInventory } from './index';
import type { UserInventory } from './index';

describe('createUserInventory', () => {
    it('adjusts the original json object on add', () => {
        const original = { wood: 2 };
        const userInventory = createUserInventory(original);
        userInventory.add('wood', 3);
        expect(original).toStrictEqual({ wood: 5 });
        // add returns the controller for chaining
        const chained: UserInventory = userInventory.add('berry').add('wood');
        expect(chained).toBe(userInventory);
        expect(original).toStrictEqual({ wood: 6, berry: 1 });
    });

    it('defaults to count 1 for add and remove', () => {
        const original = { wood: 2 };
        const userInventory = createUserInventory(original);
        userInventory.add('stone');
        expect(original).toStrictEqual({ wood: 2, stone: 1 });
        expect(userInventory.remove('stone')).toBe(true);
        expect(original).toStrictEqual({ wood: 2 });
    });

    it('adjusts the original json object on remove, dropping emptied stacks', () => {
        const original = { wood: 3, stone: 1 };
        const userInventory = createUserInventory(original);
        expect(userInventory.remove('wood', 2)).toBe(true);
        expect(original).toStrictEqual({ wood: 1, stone: 1 });
        // Spending to zero DROPS the key — the bag never holds empty husks
        expect(userInventory.remove('stone', 1)).toBe(true);
        expect(original).toStrictEqual({ wood: 1 });
    });

    it('removes atomically — an overdraft leaves the original untouched', () => {
        const original = { wood: 1 };
        const userInventory = createUserInventory(original);
        expect(userInventory.remove('wood', 2)).toBe(false);
        expect(original).toStrictEqual({ wood: 1 });
        expect(userInventory.remove('stone', 1)).toBe(false);
        expect(original).toStrictEqual({ wood: 1 });
    });

    it('binds the original object itself — no copy is made', () => {
        const original = {};
        const userInventory = createUserInventory(original);
        userInventory.add('berry', 4);
        // The very object passed in was mutated, not a clone of it
        expect(original).toStrictEqual({ berry: 4 });
        expect(Object.keys(original)).toStrictEqual(['berry']);
    });
});
