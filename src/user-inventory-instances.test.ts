// userInventory instance-sidecar tests — identified units with opaque stats
// under the unchanged aggregate count shape. Exact-value assertions
// throughout; every refusal asserts BOTH the return value AND that the bag +
// sidecar are byte-for-byte unchanged (atomicity).
import { createUserInventory } from './index';
import type { Inventory, InventoryInstance, InventoryInstances } from './index';

// Strict UUID v4 shape (mintId uses crypto.randomUUID): 36 chars, lowercase
// hex with dashes, version nibble 4, variant nibble 8/9/a/b. Minted ids are
// random, so this exact format is the only pin-able property. Variant group
// is 4 chars total (1 variant nibble + 3 hex) — the orchestrator brief's
// `[89ab][0-9a-f]{4}` draft had an off-by-one that rejects every real UUID.
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('createUserInventory — tracked instances (R1)', () => {
    it('keeps distinct same-label variants uncollapsed with stats stored unchanged', () => {
        const original: Inventory = { berries: 2 };
        const fresh = { freshness: 0.9 };
        const stale = { freshness: 0.4 };
        const instances: InventoryInstances = {
            'berry-a': { id: 'berry-a', label: 'berries', stats: fresh },
            'berry-b': { id: 'berry-b', label: 'berries', stats: stale },
        };
        const userInventory = createUserInventory(original, instances);
        // One label, two independent identities — never collapsed
        expect(Object.keys(instances)).toStrictEqual(['berry-a', 'berry-b']);
        // Stats are stored by reference, byte-for-byte unchanged
        expect(instances['berry-a'].stats).toBe(fresh);
        expect(instances['berry-b'].stats).toBe(stale);
        // Wrapping alone mutates nothing
        expect(original).toStrictEqual({ berries: 2 });
    });

    it('addInstance mints random, collision-resistant, never-reused ids and bumps the aggregate', () => {
        const original: Inventory = {};
        const userInventory = createUserInventory(original);
        const first = userInventory.addInstance('berries', { freshness: 1 })!;
        // Minted ids are NATIVE UUID v4 strings (crypto.randomUUID, 36
        // chars — same auto-id convention as presource jsonTable and nexus
        // node), with NO label prefix and no other semantic content: opaque
        // save/load handles; human meaning is caller-owned. The random value
        // is only pin-able by its exact format; every non-id field stays exact.
        const { id: firstId, ...firstRest } = first;
        expect(firstId).toMatch(UUID_V4);
        expect(firstRest).toStrictEqual({ label: 'berries', stats: { freshness: 1 } });
        const second = userInventory.addInstance('berries')!;
        const { id: secondId, ...secondRest } = second;
        expect(secondId).toMatch(UUID_V4);
        expect(secondRest).toStrictEqual({ label: 'berries', stats: {} });
        // Two mints in one controller never collide (UUID v4 randomness)
        expect(firstId).not.toBe(secondId);
        expect(original).toStrictEqual({ berries: 2 });
        // Even after removal, a minted id is never re-issued within the
        // controller's lifetime — the replacement differs from BOTH prior ids
        expect(userInventory.removeInstance(firstId)).toBe(true);
        const third = userInventory.addInstance('berries')!;
        const { id: thirdId, ...thirdRest } = third;
        expect(thirdId).toMatch(UUID_V4);
        expect(thirdId).not.toBe(firstId);
        expect(thirdId).not.toBe(secondId);
        expect(thirdRest).toStrictEqual({ label: 'berries', stats: {} });
        expect(original).toStrictEqual({ berries: 2 });
    });

    it('minted ids never collide across independently created controllers', () => {
        // Separate bags, separate controllers — only the UUID v4 randomness
        // prevents a cross-controller/cross-session collision (the sequential
        // counter this replaces would mint identical ids for both). Minted
        // ids are bare UUIDs: no label prefix, no semantic content.
        const controllerA = createUserInventory({});
        const controllerB = createUserInventory({});
        const a = controllerA.addInstance('berries', {})!;
        const b = controllerB.addInstance('berries', {})!;
        expect(a.id).toMatch(UUID_V4);
        expect(b.id).toMatch(UUID_V4);
        expect(a.id).not.toBe(b.id);
    });

    it('addInstance stores the returned record itself in the sidecar (same reference)', () => {
        const original: Inventory = {};
        const instances: InventoryInstances = {};
        const userInventory = createUserInventory(original, instances);
        const record = userInventory.addInstance('swords', { durability: 10 });
        expect(record).not.toBe(null);
        // Key by the MINTED id from the returned record (random — refusal is
        // impossible here, so non-null assert is safe)
        const mintedId = record!.id;
        expect(mintedId).toMatch(UUID_V4);
        expect(instances[mintedId]).toBe(record);
    });

    it('addInstance honors explicit ids and re-registers them after removal', () => {
        const original: Inventory = {};
        const instances: InventoryInstances = {};
        const userInventory = createUserInventory(original, instances);
        expect(userInventory.addInstance('swords', { durability: 10 }, 'sword-1')).toStrictEqual({
            id: 'sword-1',
            label: 'swords',
            stats: { durability: 10 },
        });
        expect(original).toStrictEqual({ swords: 1 });
        // Duplicate explicit id → null, nothing mutated
        expect(userInventory.addInstance('swords', { durability: 5 }, 'sword-1')).toBe(null);
        expect(original).toStrictEqual({ swords: 1 });
        expect(Object.keys(instances)).toStrictEqual(['sword-1']);
        // Round-trip identity: a removed explicit id may come back
        expect(userInventory.removeInstance('sword-1')).toBe(true);
        expect(userInventory.addInstance('swords', { durability: 2 }, 'sword-1')).toStrictEqual({
            id: 'sword-1',
            label: 'swords',
            stats: { durability: 2 },
        });
        expect(original).toStrictEqual({ swords: 1 });
    });

    it('supports typed generic stats without casts', () => {
        type SwordStats = { durability: number };
        const original: Inventory = {};
        const instances: InventoryInstances<SwordStats> = {};
        const userInventory = createUserInventory<SwordStats>(original, instances);
        const sword = userInventory.addInstance('swords', { durability: 10 })!;
        // Minted id is random — assert the exact format, keep the rest exact
        const { id, ...rest } = sword;
        expect(id).toMatch(UUID_V4);
        expect(rest).toStrictEqual({ label: 'swords', stats: { durability: 10 } });
        // Typed access — no cast needed
        expect(sword?.stats.durability).toBe(10);
    });

    it('instance methods work without a sidecar (aggregate-only callers unaffected)', () => {
        const original: Inventory = {};
        const userInventory = createUserInventory(original);
        const { id, ...rest } = userInventory.addInstance('berries', { freshness: 0.5 })!;
        // Minted id is random — assert the exact format, keep the rest exact
        expect(id).toMatch(UUID_V4);
        expect(rest).toStrictEqual({ label: 'berries', stats: { freshness: 0.5 } });
        expect(original).toStrictEqual({ berries: 1 });
        // Counted remove consumes the tracked unit when no plain unit remains
        expect(userInventory.remove('berries', 1)).toBe(true);
        expect(original).toStrictEqual({});
    });
});

describe('createUserInventory — explicit instance removal (R2)', () => {
    const seeded = (): { original: Inventory; instances: InventoryInstances } => ({
        original: { berries: 2 },
        instances: {
            'berry-a': { id: 'berry-a', label: 'berries', stats: { freshness: 0.9 } },
            'berry-b': { id: 'berry-b', label: 'berries', stats: { freshness: 0.4 } },
        },
    });

    it('removeInstance removes exactly its own instance — siblings and plain units stay', () => {
        const { original, instances } = seeded();
        const userInventory = createUserInventory(original, instances);
        expect(userInventory.removeInstance('berry-a')).toBe(true);
        expect(original).toStrictEqual({ berries: 1 });
        expect(Object.keys(instances)).toStrictEqual(['berry-b']);
        expect(instances['berry-b'].stats).toStrictEqual({ freshness: 0.4 });
    });

    it('removeInstance drops the label key when the last tracked unit leaves', () => {
        const { original, instances } = seeded();
        const userInventory = createUserInventory(original, instances);
        expect(userInventory.removeInstance('berry-a')).toBe(true);
        expect(userInventory.removeInstance('berry-b')).toBe(true);
        // The bag never holds empty husks
        expect(original).toStrictEqual({});
        expect(instances).toStrictEqual({});
    });

    it('removeInstance refuses unknown ids atomically', () => {
        const { original, instances } = seeded();
        const userInventory = createUserInventory(original, instances);
        expect(userInventory.removeInstance('nope')).toBe(false);
        expect(original).toStrictEqual({ berries: 2 });
        expect(Object.keys(instances)).toStrictEqual(['berry-a', 'berry-b']);
    });

    it('removeInstance still drops its record when the caller emptied the count directly', () => {
        const { original, instances } = seeded();
        const userInventory = createUserInventory(original, instances);
        // Direct caller write behind the facade (existing API reality)
        delete original.berries;
        expect(userInventory.removeInstance('berry-a')).toBe(true);
        // Record gone, aggregate never driven negative
        expect(original).toStrictEqual({});
        expect(Object.keys(instances)).toStrictEqual(['berry-b']);
        // The leftover desync (tracked > total) blocks counted removal instead
        // of corrupting anything
        expect(userInventory.remove('berries', 1)).toBe(false);
        expect(original).toStrictEqual({});
        expect(Object.keys(instances)).toStrictEqual(['berry-b']);
    });
});

describe('createUserInventory — counted removal reconciliation (R2)', () => {
    const seeded = (count: number): { original: Inventory; instances: InventoryInstances } => ({
        original: { berries: count },
        instances: {
            'berry-a': { id: 'berry-a', label: 'berries', stats: { freshness: 0.9 } },
            'berry-b': { id: 'berry-b', label: 'berries', stats: { freshness: 0.4 } },
        },
    });

    it('consumes plain units first — tracked variants survive while plain remain', () => {
        // 3 total = 1 plain + 2 tracked
        const { original, instances } = seeded(3);
        const userInventory = createUserInventory(original, instances);
        expect(userInventory.remove('berries', 2)).toBe(true);
        expect(original).toStrictEqual({ berries: 1 });
        // The plain unit + the OLDEST tracked instance went; berry-b survives
        expect(Object.keys(instances)).toStrictEqual(['berry-b']);
        expect(instances['berry-b'].stats).toStrictEqual({ freshness: 0.4 });
    });

    it('consumes tracked instances oldest-first over tracked-only stock', () => {
        const { original, instances } = seeded(2);
        const userInventory = createUserInventory(original, instances);
        expect(userInventory.remove('berries', 1)).toBe(true);
        expect(original).toStrictEqual({ berries: 1 });
        expect(Object.keys(instances)).toStrictEqual(['berry-b']);
    });

    it('spends tracked instances down to zero deterministically, dropping the key', () => {
        const { original, instances } = seeded(2);
        const userInventory = createUserInventory(original, instances);
        expect(userInventory.remove('berries', 2)).toBe(true);
        expect(original).toStrictEqual({});
        expect(instances).toStrictEqual({});
    });

    it('refuses an overdraft atomically — bag AND sidecar untouched', () => {
        const { original, instances } = seeded(1);
        const userInventory = createUserInventory(original, instances);
        expect(userInventory.remove('berries', 2)).toBe(false);
        expect(original).toStrictEqual({ berries: 1 });
        expect(Object.keys(instances)).toStrictEqual(['berry-a', 'berry-b']);
    });

    it('reconciles tracked units that exceed a directly-shrunk count (newest trimmed first)', () => {
        const { original, instances } = seeded(3);
        const userInventory = createUserInventory(original, instances);
        // Direct caller write shrinks the aggregate behind the facade
        original.berries = 1;
        expect(userInventory.remove('berries', 1)).toBe(true);
        // Reconcile trims NEWEST (berry-c never existed; berry-b is newest of
        // the two) until tracked ≤ total, then consumption runs plain-first —
        // plain = 1 − 1 = 0, so berry-a is consumed too
        expect(original).toStrictEqual({});
        expect(instances).toStrictEqual({});
    });

    it('reconciles without consuming anything when the removal is covered by plain units', () => {
        const { original, instances } = seeded(3);
        const userInventory = createUserInventory(original, instances);
        original.berries = 2; // direct write: now 2 total, 2 tracked, 0 plain
        expect(userInventory.remove('berries', 1)).toBe(true);
        // Plain margin was eaten by the direct write, so the OLDEST tracked
        // instance is consumed; berry-b (newest, freshest payload) survives
        expect(original).toStrictEqual({ berries: 1 });
        expect(Object.keys(instances)).toStrictEqual(['berry-b']);
    });

    it('same-label variants keep their stats through mixed plain/tracked cycles', () => {
        const { original, instances } = seeded(2);
        const userInventory = createUserInventory(original, instances);
        // Explicit removal spares the sibling's payload
        expect(userInventory.removeInstance('berry-a')).toBe(true);
        // Plain adds are untracked units — berry-b is never touched
        userInventory.add('berries', 2);
        expect(original).toStrictEqual({ berries: 3 });
        expect(Object.keys(instances)).toStrictEqual(['berry-b']);
        // Spending everything consumes the plain units first, then berry-b
        expect(userInventory.remove('berries', 3)).toBe(true);
        expect(original).toStrictEqual({});
        expect(instances).toStrictEqual({});
    });
});

describe('createUserInventory — prototype-safe explicit ids (regression)', () => {
    it("registers '__proto__' as an own enumerable key — never a prototype change", () => {
        const original: Inventory = {};
        const instances: InventoryInstances = {};
        const userInventory = createUserInventory(original, instances);
        const record = userInventory.addInstance('berries', { freshness: 0.9 }, '__proto__');
        expect(record).toStrictEqual({ id: '__proto__', label: 'berries', stats: { freshness: 0.9 } });
        // The registration created an OWN, enumerable data property — ordinary
        // assignment would have invoked the inherited __proto__ setter instead
        // (no own entry, sidecar prototype replaced, record stranded)
        expect(Object.prototype.hasOwnProperty.call(instances, '__proto__')).toBe(true);
        expect(Object.keys(instances)).toStrictEqual(['__proto__']);
        expect(Object.getOwnPropertyDescriptor(instances, '__proto__')?.writable).toBe(true);
        expect(Object.getOwnPropertyDescriptor(instances, '__proto__')?.configurable).toBe(true);
        // The sidecar's prototype is UNCHANGED — still Object.prototype
        expect(Object.getPrototypeOf(instances)).toBe(Object.prototype);
        // The instance IS one aggregate unit
        expect(original).toStrictEqual({ berries: 1 });
    });

    it("removeInstance removes the '__proto__' instance exactly — aggregate 0, prototype intact", () => {
        const original: Inventory = {};
        const instances: InventoryInstances = {};
        const userInventory = createUserInventory(original, instances);
        expect(userInventory.addInstance('berries', { freshness: 0.9 }, '__proto__')).not.toBe(null);
        expect(userInventory.removeInstance('__proto__')).toBe(true);
        // Aggregate back to zero (key dropped), record gone, prototype untouched
        expect(original).toStrictEqual({});
        expect(instances).toStrictEqual({});
        expect(Object.keys(instances)).toStrictEqual([]);
        expect(Object.getPrototypeOf(instances)).toBe(Object.prototype);
        // Round-trip identity: the same dangerous id is registrable again
        expect(userInventory.addInstance('berries', { freshness: 0.5 }, '__proto__')).toStrictEqual({
            id: '__proto__',
            label: 'berries',
            stats: { freshness: 0.5 },
        });
        expect(Object.keys(instances)).toStrictEqual(['__proto__']);
        expect(Object.getPrototypeOf(instances)).toBe(Object.prototype);
    });

    it("counts '__proto__' instances as tracked units in counted removals", () => {
        const original: Inventory = { berries: 1 };
        const instances: InventoryInstances = {};
        const userInventory = createUserInventory(original, instances);
        expect(userInventory.addInstance('berries', { freshness: 0.9 }, '__proto__')).not.toBe(null);
        expect(original).toStrictEqual({ berries: 2 });
        // Plain-first consumption: the first removal eats the PLAIN unit, so
        // the tracked '__proto__' instance survives (deterministic order)
        expect(userInventory.remove('berries', 1)).toBe(true);
        expect(original).toStrictEqual({ berries: 1 });
        expect(Object.keys(instances)).toStrictEqual(['__proto__']);
        // Second removal has no plain stock left → the tracked '__proto__'
        // unit is consumed, and its deletion leaves the prototype untouched
        expect(userInventory.remove('berries', 1)).toBe(true);
        expect(original).toStrictEqual({});
        expect(instances).toStrictEqual({});
        expect(Object.getPrototypeOf(instances)).toBe(Object.prototype);
    });

    it("keeps 'constructor' and 'toString' ids safe as own properties", () => {
        const original: Inventory = {};
        const instances: InventoryInstances = {};
        const userInventory = createUserInventory(original, instances);
        expect(userInventory.addInstance('swords', { durability: 10 }, 'constructor')).not.toBe(null);
        expect(userInventory.addInstance('swords', { durability: 3 }, 'toString')).not.toBe(null);
        expect(original).toStrictEqual({ swords: 2 });
        expect(Object.keys(instances)).toStrictEqual(['constructor', 'toString']);
        expect(Object.getPrototypeOf(instances)).toBe(Object.prototype);
        // Both are individually removable through the explicit API
        expect(userInventory.removeInstance('constructor')).toBe(true);
        expect(Object.keys(instances)).toStrictEqual(['toString']);
        expect(original).toStrictEqual({ swords: 1 });
        expect(userInventory.removeInstance('toString')).toBe(true);
        expect(original).toStrictEqual({});
        expect(instances).toStrictEqual({});
        expect(Object.getPrototypeOf(instances)).toBe(Object.prototype);
    });
});

describe('createUserInventory — stats opacity', () => {
    it('stores the stats payload by reference and never mutates it', () => {
        // Frozen payload: any package-side write would throw
        const stats = Object.freeze({ freshness: 0.9, tags: Object.freeze(['sweet']) });
        const original: Inventory = {};
        const instances: InventoryInstances = {};
        const userInventory = createUserInventory(original, instances);
        const record = userInventory.addInstance('berries', stats);
        expect(record?.stats).toBe(stats);
        // Consumption cycles do not reach into the payload
        expect(userInventory.remove('berries', 1)).toBe(true);
        expect(instances).toStrictEqual({});
        expect(stats).toStrictEqual({ freshness: 0.9, tags: ['sweet'] });
        // Re-registering the same payload object stores it unchanged again
        expect(userInventory.addInstance('berries', stats)?.stats).toBe(stats);
    });
});

describe('createUserInventory — input validation & atomic refusals', () => {
    it('addInstance validates before mutating anything', () => {
        const original: Inventory = {};
        const instances: InventoryInstances = {};
        const userInventory = createUserInventory(original, instances);
        expect(userInventory.addInstance('')).toBe(null); // empty label
        expect(userInventory.addInstance('berries', null as never)).toBe(null); // null stats
        expect(userInventory.addInstance('berries', {}, 5 as never)).toBe(null); // non-string id
        expect(userInventory.addInstance('berries', {}, '')).toBe(null); // empty id
        // Every refusal left bag + sidecar exactly as they were
        expect(original).toStrictEqual({});
        expect(instances).toStrictEqual({});
    });

    it('addInstance accepts arrays and nested payloads as opaque stats', () => {
        const original: Inventory = {};
        const userInventory = createUserInventory(original);
        const payload = { roll: [1, 2, 3], meta: { note: 'gift' } };
        const { id, ...rest } = userInventory.addInstance('scrolls', payload)!;
        // Minted id is random — assert the exact format, keep the rest exact
        expect(id).toMatch(UUID_V4);
        expect(rest).toStrictEqual({
            label: 'scrolls',
            stats: { roll: [1, 2, 3], meta: { note: 'gift' } },
        });
        expect(original).toStrictEqual({ scrolls: 1 });
    });
});

describe('createUserInventory — legacy count API preserved (R4)', () => {
    it('add/remove behave exactly as before when a sidecar is present', () => {
        const original: Inventory = { wood: 2 };
        const userInventory = createUserInventory(original, {});
        userInventory.add('wood', 3); // plain untracked units
        expect(original).toStrictEqual({ wood: 5 });
        expect(userInventory.remove('wood', 2)).toBe(true);
        expect(original).toStrictEqual({ wood: 3 });
        // Chaining intact
        expect(userInventory.add('berry').add('wood')).toBe(userInventory);
        expect(original).toStrictEqual({ wood: 4, berry: 1 });
    });

    it('an empty sidecar never changes overdraft atomicity', () => {
        const original: Inventory = { wood: 1 };
        const userInventory = createUserInventory(original, {});
        expect(userInventory.remove('wood', 2)).toBe(false);
        expect(original).toStrictEqual({ wood: 1 });
        expect(userInventory.remove('stone')).toBe(false);
        expect(original).toStrictEqual({ wood: 1 });
    });

    it('wrapping with a sidecar does not add keys to the caller bag', () => {
        const original: Inventory = {};
        const instances: InventoryInstances = {};
        createUserInventory(original, instances);
        expect(original).toStrictEqual({});
        expect(instances).toStrictEqual({});
    });
});

describe('createUserInventory — instance type shape', () => {
    it('records carry id, label and stats exactly as specified', () => {
        const original: Inventory = {};
        const userInventory = createUserInventory(original);
        const record: InventoryInstance | null = userInventory.addInstance('berries', {
            freshness: 1,
        });
        expect(Object.keys(record as object).sort()).toStrictEqual(['id', 'label', 'stats']);
    });
});
