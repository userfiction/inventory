// Canonical inventory bag tests — proves the pure Record<item, count>
// helpers work in @userfiction/inventory, their new canonical owner (moved
// from packages/userfiction/core/inventory/inventory.test.ts; core no
// longer exports them). The engine side, e.g. distribution/StrandedIsland,
// re-exports these unchanged. Atomicity — every failed operation leaves
// both sides untouched — is the invariant under test. Exact-value
// assertions throughout.
import {
    inventoryAdd,
    inventoryAffords,
    inventoryCount,
    inventoryEntries,
    inventoryExchange,
    inventoryFits,
    inventoryHas,
    inventoryRemove,
    inventoryTotal,
    inventoryTransfer,
    type Inventory,
} from './index';

describe('inventory bag primitives', () => {
    it('counts, adds and removes with exact results', () => {
        const bag: Inventory = {};
        expect(inventoryCount(bag, 'wood')).toBe(0);
        inventoryAdd(bag, 'wood', 3);
        expect(bag).toStrictEqual({ wood: 3 });
        expect(inventoryRemove(bag, 'wood', 2)).toBe(true);
        expect(bag).toStrictEqual({ wood: 1 });
        // Spending to zero DROPS the key — the bag never holds empty husks
        expect(inventoryRemove(bag, 'wood', 1)).toBe(true);
        expect(bag).toStrictEqual({});
        // Overdraft: nothing changes, false is returned — never partial
        expect(inventoryRemove(bag, 'wood', 1)).toBe(false);
        expect(bag).toStrictEqual({});
    });

    it('lists entries, totals units and checks fits/has/affords exactly', () => {
        const bag: Inventory = { wood: 2, stone: 0, berry: 3 };
        expect(inventoryEntries(bag)).toEqual([
            { item: 'wood', count: 2 },
            { item: 'berry', count: 3 },
        ]);
        expect(inventoryTotal(bag)).toBe(5);
        expect(inventoryFits(bag, { shell: 3 }, 8)).toBe(true);
        expect(inventoryFits(bag, { shell: 4 }, 8)).toBe(false);
        expect(inventoryHas(bag, 'wood')).toBe(true);
        expect(inventoryHas(bag, 'wood', 3)).toBe(false);
        // Affordance is per-item against the held counts
        expect(inventoryAffords(bag, { wood: 2, berry: 3 })).toBe(true);
        expect(inventoryAffords(bag, { wood: 3 })).toBe(false);
    });

    it('transfers atomically — an unaffordable move changes neither side', () => {
        const from: Inventory = { wood: 1 };
        const to: Inventory = { stone: 2 };
        expect(inventoryTransfer(from, to, 'wood', 2)).toBe(false);
        expect(from).toStrictEqual({ wood: 1 });
        expect(to).toStrictEqual({ stone: 2 });
        expect(inventoryTransfer(from, to, 'wood', 1)).toBe(true);
        expect(from).toStrictEqual({});
        expect(to).toStrictEqual({ stone: 2, wood: 1 });
    });

    it('exchanges fully atomically — a failed trade leaves both bags exactly as they were', () => {
        const giver: Inventory = { berry: 2 };
        const receiver: Inventory = { stone: 1 };
        // The receiver cannot afford the request — nothing moves at all
        expect(inventoryExchange(giver, receiver, { berry: 1 }, { stone: 2 })).toBe(false);
        expect(giver).toStrictEqual({ berry: 2 });
        expect(receiver).toStrictEqual({ stone: 1 });
        // Affordable trade: both sides move in one step
        expect(inventoryExchange(giver, receiver, { berry: 2 }, { stone: 1 })).toBe(true);
        expect(giver).toStrictEqual({ stone: 1 });
        expect(receiver).toStrictEqual({ berry: 2 });
    });
});
