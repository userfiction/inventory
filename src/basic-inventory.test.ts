// basicInventory accessor tests — moved from
// packages/userfiction/core/inventory/basic-inventory.test.ts (the factory
// now lives in @userfiction/inventory). The accessor lazily initializes
// entries in the CALLER's shared data object: name defaults to the id,
// amount defaults to 0, and both are getter/setters. Exact-value
// assertions throughout.
import { basicInventory } from './index';

describe('basicInventory requirement', () => {
    it('should able to access any inventory item by its id', () => {
        const data = {};
        // Create an inventory
        const inventory = basicInventory(data);
        // Inventory doesn't exist in the list, so its name will automatically called "stone"
        expect(inventory('stone').name()).toBe('stone');
        expect(inventory('stone').amount()).toBe(0);

        // Expecting the Data to Strictly Equal 0
        expect(data).toStrictEqual({
            stone: {
                name: 'stone',
                amount: 0
            }
        });
    });

    it('should able to set the value freely', () => {
        const data = {};
        // Create an inventory
        const inventory = basicInventory(data);
        // Setting Value

        // Setting the name as water
        inventory('water').name('Water');
        inventory('water').amount(100);

        // Expecting the Data to Strictly Equal 0
        expect(data).toStrictEqual({
            water: {
                name: 'Water',
                amount: 100
            }
        });
    });

    it('should support multiple items independently', () => {
        const data = {};
        const inventory = basicInventory(data);

        // Access two different items — each gets its own entry
        inventory('sword').amount(1);
        inventory('shield').name('Iron Shield');
        inventory('shield').amount(3);

        // Both items exist in data with correct values
        expect(data).toStrictEqual({
            sword: { name: 'sword', amount: 1 },
            shield: { name: 'Iron Shield', amount: 3 },
        });
    });

    it('should return existing data on repeated access without re-initializing', () => {
        const data = {};
        const inventory = basicInventory(data);

        // Set values
        inventory('potion').name('Health Potion');
        inventory('potion').amount(5);

        // Re-access the same item — values should persist, not reset
        expect(inventory('potion').name()).toBe('Health Potion');
        expect(inventory('potion').amount()).toBe(5);

        // Data should only have the single entry with the set values
        expect(data).toStrictEqual({
            potion: { name: 'Health Potion', amount: 5 },
        });
    });

    it('should act as getter when called with no arguments', () => {
        const data = {};
        const inventory = basicInventory(data);

        // Initialize with defaults
        expect(inventory('gold').name()).toBe('gold');
        expect(inventory('gold').amount()).toBe(0);

        // Set values
        inventory('gold').name('Gold Coin');
        inventory('gold').amount(999);

        // Getter returns current values
        expect(inventory('gold').name()).toBe('Gold Coin');
        expect(inventory('gold').amount()).toBe(999);
    });

    it('should allow updating amount multiple times', () => {
        const data = {};
        const inventory = basicInventory(data);

        // Incrementally update amount
        inventory('arrow').amount(10);
        inventory('arrow').amount(20);
        inventory('arrow').amount(5);

        // Only the last set value should remain
        expect(inventory('arrow').amount()).toBe(5);
        expect(data).toStrictEqual({
            arrow: { name: 'arrow', amount: 5 },
        });
    });
});
