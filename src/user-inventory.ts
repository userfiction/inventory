// ============================================================================
// userInventory facade — bound controller over the ORIGINAL bag object plus
// an optional caller-owned INSTANCE SIDECAR
// ============================================================================
// `createUserInventory(original)` closes over the ORIGINAL json object and
// every method mutates it in place: no wrapper state, no copies — the
// caller's object IS the inventory.
//
//     const bag = { wood: 2 };
//     const userInventory = createUserInventory(bag);
//     userInventory.add('wood', 3);    // bag is now { wood: 5 }
//     userInventory.remove('wood', 2); // bag is now { wood: 3 }
//
// ---------------------------------------------------------------------------
// Identified instances with opaque stats (additive API)
// ---------------------------------------------------------------------------
// Individual items that share a label may differ (one berry half rotten,
// another fresh; one sword pristine, another chipped). The aggregate
// `Record<label, count>` shape is UNCHANGED — caller-owned, legacy-compatible
// — and an OPTIONAL second caller-owned object, the instance sidecar, tracks
// identified units underneath those counts:
//
//     const instances = {};                     // caller-owned sidecar
//     const userInventory = createUserInventory(bag, instances);
//     userInventory.addInstance('berries', { freshness: 0.4 }, 'berry-b');
//     instances['berry-b'].stats.freshness;     // 0.4 — stored unchanged
//     userInventory.removeInstance('berry-b');  // removes exactly that unit
//
// Contract:
// - Stats are OPAQUE: the package never reads, interprets, copies or mutates
//   a stats payload — it stores the exact object it was given, by reference.
// - Tracked units are IDENTITIES: ids minted by a controller are never
//   reused within that controller's lifetime and are native UUID v4s
//   (crypto.randomUUID) so ids minted in different sessions/controllers
//   cannot collide — ids are purely for saving/loading (to re-sync
//   instances); in memory, object references are the identity. Explicit
//   ids must be unique among CURRENTLY tracked instances and may be
//   re-registered after their previous holder is gone (an instance traded
//   away and traded back keeps its identity).
// - The sidecar is the caller's object: mutated in place and IS the instance
//   read surface (the facade deliberately has no read methods — reads go to
//   the caller-owned original bag and sidecar, exactly like the counts).
// - Count-based `add` credits PLAIN, untracked units; `addInstance` credits
//   one tracked unit. Counted `remove` consumes plain units first and then
//   tracked instances deterministically (oldest-first), so a plain removal
//   never silently destroys a stats-bearing instance while a plain unit
//   remains.
// - SYNCHRONIZATION CONSTRAINT (existing API reality): callers may mutate
//   the aggregate counts directly and the facade cannot observe that, so a
//   direct write can desync the sidecar (tracked > count). No impossible
//   invariant is promised across direct writes; every counted removal and
//   instance op self-heals deterministically at that moment (see the
//   per-method comments). Between ops, the desync simply persists.
// ============================================================================

import { inventoryAdd, inventoryCount, inventoryRemove, type Inventory } from './inventory';

/** Arbitrary per-instance stats payload. Opaque to this package. */
export type ItemStats = Record<string, unknown>;

/**
 * One identified unit inside a bag: belongs to an aggregate `label` and
 * carries an opaque `stats` payload stored exactly as given (by reference).
 */
export type InventoryInstance<Stats extends ItemStats = ItemStats> = {
    /** Stable identity. Unique among the controller's CURRENTLY tracked ids. */
    id: string;
    /** The aggregate label this instance contributes one unit to. */
    label: string;
    /** Opaque payload — stored unchanged, never interpreted by the package. */
    stats: Stats;
};

/**
 * Caller-owned instance sidecar: instance id → instance record. Mutated in
 * place by the controller; keys are the identity namespace of one controller
 * (records must satisfy `sidecar[id].id === id`).
 */
export type InventoryInstances<Stats extends ItemStats = ItemStats> = Record<
    string,
    InventoryInstance<Stats>
>;

/** The controller returned by `createUserInventory`, bound to one bag. */
export type UserInventory<Stats extends ItemStats = ItemStats> = {
    /**
     * Adds `count` (default 1) of `item` to the original object as PLAIN,
     * untracked units and returns the controller for chaining.
     */
    add: (item: string, count?: number) => UserInventory<Stats>;
    /**
     * Removes `count` (default 1) of `item` from the original object.
     * Atomic: when the bag cannot afford it, nothing changes (bag AND
     * sidecar) and `false` is returned — never a partial removal.
     * Consumes plain units first, then tracked instances oldest-first
     * (deterministic reconciliation — see the implementation comment).
     */
    remove: (item: string, count?: number) => boolean;
    /**
     * Adds ONE identified instance of `label` with an opaque `stats` payload
     * (default `{}`): bumps the aggregate count by 1 and registers the
     * instance in the sidecar. Returns the exact record stored in the
     * sidecar, or `null` when the input is refused (nothing mutated):
     * empty label / id, non-object stats, or an explicit `id` that is
     * already currently tracked.
     */
    addInstance: (label: string, stats?: Stats, id?: string) => InventoryInstance<Stats> | null;
    /**
     * Removes the identified instance `id` and its one aggregate unit:
     * only that instance is affected (sibling instances and plain units
     * stay). Returns `false` for an unknown id (nothing mutated). When the
     * caller already emptied the aggregate count directly behind the
     * facade, the record is still dropped while the bag is left untouched
     * (the aggregate is never driven negative).
     */
    removeInstance: (id: string) => boolean;
};

// --- internal validation helpers (module-private) ---------------------------
// Prototype-safe own-key check: ids like 'toString' must not resolve through
// Object.prototype when testing sidecar membership.
const hasOwn = (target: object, key: string): boolean =>
    Object.prototype.hasOwnProperty.call(target, key);

const isNonEmptyString = (value: unknown): value is string =>
    typeof value === 'string' && value.length > 0;

// Stats must be an object payload (arrays included — opacity means the
// package does not police the shape). `undefined` means "no stats" and is
// defaulted to `{}` by the caller site; `null`/primitives are refused.
const isStatsValue = (value: unknown): value is ItemStats =>
    typeof value === 'object' && value !== null;

/** Creates a `userInventory` controller operating on the ORIGINAL object. */
export const createUserInventory = <Stats extends ItemStats = ItemStats>(
    original: Inventory,
    // Default: an internal, caller-invisible sidecar — instance methods stay
    // available, aggregate-only callers are unaffected either way.
    instances: InventoryInstances<Stats> = {},
): UserInventory<Stats> => {
    // Identity namespace bookkeeping: every id ever issued (or seeded from
    // the caller's sidecar) is remembered so MINTED ids never repeat within
    // this controller's lifetime — even after removals. Explicit ids are
    // validated against CURRENTLY tracked keys instead (not this set), so an
    // instance can return home with its identity after being traded away.
    const issued = new Set<string>(Object.keys(instances));

    // Mints an unused id via the NATIVE crypto.randomUUID (UUID v4) — the
    // same auto-id strategy as @presource/core's jsonTable
    // (packages/presource/core/src/json/table.ts:147) and @presource/nexus
    // (node.ts:402): no custom id tooling to maintain. Ids are opaque
    // tracking handles for saving/loading — no semantic content, no label
    // prefix; human meaning (display names) is caller-owned. The `issued`
    // re-check guarantees within-lifetime never-reuse (an astronomically
    // unlikely collision is simply re-rolled).
    const mintId = (): string => {
        let candidate = '';
        do {
            candidate = crypto.randomUUID();
        } while (issued.has(candidate));
        issued.add(candidate);
        return candidate;
    };

    // All sidecar records for `label`, in sidecar insertion order (oldest
    // first). This order IS the deterministic consumption/reconciliation
    // order used by counted removals.
    const trackedEntries = (label: string): Array<[string, InventoryInstance<Stats>]> =>
        Object.entries(instances).filter(([, record]) => record.label === label);

    const controller: UserInventory<Stats> = {
        // Plain, untracked units only — the sidecar is untouched. Existing
        // count API behavior is preserved verbatim (R4).
        add: (item, count = 1) => {
            inventoryAdd(original, item, count);
            return controller;
        },

        remove: (item, count = 1) => {
            // (1) Affordability gate — a pure read, identical to the
            //     primitive's own check, so the two can never disagree.
            //     On refusal NEITHER the bag NOR the sidecar changes:
            //     counted removal stays all-or-nothing.
            const total = inventoryCount(original, item);
            if (total < count) {
                return false;
            }

            // (2) Deterministic tracked consumption. Plain (untracked)
            //     units are consumed first — a stats-bearing instance is
            //     only spent when no plain unit remains — and then tracked
            //     instances go oldest-first (sidecar insertion order).
            //     Non-positive/non-integer counts consume nothing tracked;
            //     the aggregate still flows through the primitive below
            //     with its existing (unchanged) behavior.
            const demand = Number.isInteger(count) && count > 0 ? count : 0;
            const plain = Math.max(0, total - trackedEntries(item).length);
            const fromPlain = Math.min(demand, plain);
            const fromTracked = demand - fromPlain;

            // (3) Self-healing reconciliation BEFORE the sidecar deletes:
            //     if a direct caller write left tracked > total (existing
            //     API reality — the facade cannot observe direct writes),
            //     the NEWEST tracked records are trimmed until tracked ≤
            //     total, so the sidecar can never claim more units than
            //     the aggregate count holds after a counted removal.
            const stale = trackedEntries(item);
            for (let i = stale.length - 1; i >= total; i -= 1) {
                delete instances[stale[i][0]];
            }

            // (4) Apply: aggregate first via the atomic primitive (cannot
            //     refuse after gate (1) — identical condition), and only
            //     after it succeeded do the sidecar deletions run, so a
            //     hypothetical primitive failure could never strand the
            //     sidecar in a half-consumed state.
            if (!inventoryRemove(original, item, count)) {
                return false; // unreachable after gate (1); kept defensive
            }
            trackedEntries(item)
                .slice(0, fromTracked)
                .forEach(([key]) => {
                    delete instances[key];
                });
            return true;
        },

        addInstance: (label, stats, id) => {
            // Validate BEFORE any mutation: a refused add leaves the bag
            // and the sidecar exactly as they were (atomic refusal).
            if (!isNonEmptyString(label)) {
                return null;
            }
            if (stats !== undefined && !isStatsValue(stats)) {
                return null;
            }
            if (id !== undefined) {
                if (!isNonEmptyString(id)) {
                    return null;
                }
                // Explicit ids must be free among CURRENTLY tracked
                // instances. A previously removed id is registrable again
                // (round-trip identity), but a live one is a real collision.
                if (hasOwn(instances, id)) {
                    return null;
                }
            }

            const finalId = id ?? mintId();
            const record: InventoryInstance<Stats> = {
                id: finalId,
                label,
                // Stats stored EXACTLY as given (same reference, opaque):
                // undefined defaults to a fresh `{}` per instance.
                stats: (stats === undefined ? {} : stats) as Stats,
            };
            // The instance IS one unit of its label: bump the aggregate
            // together with the sidecar registration (both writes are
            // infallible post-validation, so no partial state is possible).
            inventoryAdd(original, label, 1);
            // Register via defineProperty, NOT ordinary assignment: an
            // assignment `instances[finalId] = record` on a plain sidecar
            // would invoke the INHERITED `Object.prototype.__proto__`
            // setter when finalId === '__proto__' — no own entry created,
            // the sidecar's prototype silently replaced, and the record
            // stranded (hasOwn → false, removeInstance unfindable).
            // defineProperty always creates an OWN, enumerable, writable,
            // configurable data property with ordinary-assignment semantics
            // for every other id, so arbitrary explicit ids (including
            // '__proto__') stay supported with no prototype side effects.
            Object.defineProperty(instances, finalId, {
                value: record,
                enumerable: true,
                writable: true,
                configurable: true,
            });
            issued.add(finalId);
            return record;
        },

        removeInstance: (id) => {
            // Unknown id → refusal, nothing mutated. Own-key check keeps
            // prototype-resolvable ids ('toString', …) from matching.
            if (!isNonEmptyString(id) || !hasOwn(instances, id)) {
                return false;
            }
            const record = instances[id];
            // Shrink the aggregate by exactly 1 for the record's label —
            // but never below zero: a direct caller write may already have
            // emptied the stack behind the facade, in which case the record
            // still goes while the bag is left untouched. No other label,
            // sibling instance or plain unit is affected.
            if (inventoryCount(original, record.label) > 0) {
                inventoryRemove(original, record.label, 1);
            }
            delete instances[id];
            return true;
        },
    };
    return controller;
};
