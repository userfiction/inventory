// ============================================================================
// demo/main.test.ts — full-app integration tests for the presentation-only UI
// ============================================================================
// Boots the REAL demo app (demo/main.ts) inside jsdom against a mirror of
// demo/index.html's static shell (header + two panels — NO forms/exchange/log
// mounts, those are gone), then pins the new icon-grid + JSON UI contract
// exactly. Every expected value below is derived from demo/main.ts (seed
// order via seedInstance → addInstance, the demo-owned `unitNames` map,
// groupedUnitsView, trackedChip, plainChip, onDragStart, readPayload,
// applyTransfer, renderJson) — nothing is asserted loosely.
//
// RANDOM MINTED IDS: the demo seeds its tracked instances through
// createUserInventory(...).addInstance(...) (src/user-inventory.ts mintId →
// crypto.randomUUID), so every tracked id is a NATIVE UUID v4 string
// matching /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
// (36 chars: 8-4-4-4-12 lowercase hex groups with dashes, version nibble '4',
// variant nibble 8/9/a/b) — never a hand-written literal. Tests therefore
// CAPTURE each id from the rendered DOM (dataset.instanceId) or a parsed JSON
// view BEFORE any mutation, validate the mint format with toMatch, and then
// use the captured string as the EXACT expected value in every full toEqual.
// No hardcoded real ids anywhere — the only literal ids in this file are the
// deliberately UNKNOWN ones inside the refusal tests.
//
// OPTIONAL NAMES: display names live in the demo-owned global `unitNames`
// map keyed by minted id (the PROPOSED listing entry type { id, name?, stats
// }): `name` appears ONLY on named units — the oldest hero sword
// ('Dawnbreaker', durability 10) and the merchant sword ('Honest steel',
// durability 7). Because the map is keyed by id, a name TRAVELS with its
// unit through drag & drop transfers. Key order in the listing JSON is
// id → name? → stats (pinned via Object.keys on the parsed entries —
// toEqual itself is order-insensitive). Tooltip = [id, name?, statsLine]
// joined with ' · '.
//
// Covered:
//   1. Title: #demo-title textContent AND document.title ===
//      "Userfiction Inventory v1.0.2" (version from ../package.json)
//   2. Initial hero icon grid: berries ×2 / swords ×2 groups in bag-key
//      order, exact tracked chip sequence (dataset, draggable, tabindex,
//      aria-label, tooltip text, emoji icons) with minted ids; named sword
//      chip first (sidecar insertion order = oldest first), ids distinct
//   3. Initial merchant icon grid: rope ×4 + lantern ×1 plain chips,
//      swords ×1 tracked (minted id · 'Honest steel' · durability 7)
//   4. Initial JSON views: grouped per-unit view (PROPOSED entry type
//      { id, name?, stats } — `name` key only on named units, exact key
//      lists) + raw wrapped-original counts per owner, plus both headings
//   5. dragstart writes the identity-only payload into dataTransfer
//      ('text/plain') — tracked: from,kind,id,label key order (asserted
//      PARSED, the id is random); plain: from,kind,label (exact literal) —
//      and sets effectAllowed = 'move'
//   6. Tracked drop moves the oldest hero sword → merchant: same minted id,
//      stats AND name intact ('Dawnbreaker' follows the unit via the global
//      unitNames map), sidecar insertion order, data-from re-rendered under
//      the new owner, both owners' grids + grouped/raw JSONs updated
//   7. Plain drop moves one rope unit merchant → hero (plain-first
//      consumption guarantees a plain unit moves)
//   8. No-op drops stay byte-identical: same-owner panel, garbage payload,
//      tracked id missing from the source sidecar, unknown owner
//   9. dragover highlights the panel (preventDefault + .drop-target class);
//      dragleave and drop clear it
//  10. Empty-bag rendering: the static seed has no mutation path besides
//      drag & drop, so the empty state is reached by chaining tracked drops
//      until the hero is fully drained (deterministic user path; every drop
//      payload is built from a RUNTIME-CAPTURED id read off the CURRENT DOM
//      right before the drop) — the grid is replaced by the "empty bag" note
//      and the hero JSONs become '{}', while the merchant accumulates every
//      unit under its OWN label in drop order (labels never merge)
//
// jsdom has no real DataTransfer, so every drag event is a synthetic
// cancelable Event carrying a stub transfer ({ getData, setData: vi.fn(),
// effectAllowed }) — the deterministic substitute for native HTML5 DnD.
// ============================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Shell: mirrors demo/index.html (the static skeleton main.ts mounts into —
// the panel ids are required: each <section> is wired as a drop target)
// ---------------------------------------------------------------------------

const SHELL_HTML = `
<header class="top"><h1 id="demo-title">Userfiction Inventory</h1></header>
<main class="layout">
  <section class="panel" id="hero-panel" aria-label="Hero inventory">
    <h2>Hero</h2><div id="hero-bag"></div><div id="hero-json"></div>
  </section>
  <section class="panel" id="merchant-panel" aria-label="Merchant inventory">
    <h2>Merchant</h2><div id="merchant-bag"></div><div id="merchant-json"></div>
  </section>
</main>`;

// ---------------------------------------------------------------------------
// Types — the grouped per-unit view the UI renders (same shape the JSON shows)
// ---------------------------------------------------------------------------

type OwnerId = 'hero' | 'merchant';
// PROPOSED listing entry type (demo/main.ts TrackedEntry): the minted random
// id, the display name ONLY when the unit has one (demo's global `unitNames`
// map — an entry that was never named has NO `name` key at all), then the
// complete opaque stats payload. Track-ness is decided by KEY PRESENCE:
// tracked entries always carry ≥ 1 key (the id handle — save/load plumbing).
type TrackedEntry = { id: string; name?: string; stats: Record<string, unknown> };
// Plain units have nothing to track — their grouped per-unit entry is simply
// the EMPTY object `{}` (no id, no name, no stats, no invented markers).
// Mirrors demo/main.ts's PlainEntry = Record<string, never>.
type PlainEntry = Record<string, never>;
type UnitEntry = TrackedEntry | PlainEntry;
type GroupedView = Record<string, UnitEntry[]>;
type RawBag = Record<string, number>;

// ---------------------------------------------------------------------------
// Minted-id handling — every tracked id in the demo is RANDOM (a native UUID
// v4 minted by src/user-inventory.ts mintId via crypto.randomUUID). Tests
// capture ids from the live DOM, validate the mint format, and treat the
// captured string as the exact expected value everywhere else. A missing
// data-instance-id is a bug, never an expected outcome.
// ---------------------------------------------------------------------------

// Strict UUID v4 shape (exactly what crypto.randomUUID() produces): 8-4-4-4-12
// lowercase hex groups joined by dashes, version nibble '4' in the third
// group, variant nibble 8/9/a/b in the fourth group
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const chipId = (chip: HTMLElement): string => {
    const id = chip.dataset.instanceId;
    if (id === undefined) {
        throw new Error(`tracked chip without data-instance-id: ${chip.outerHTML}`);
    }
    return id;
};

// Capture + validate one minted id as an EXACT test value: the UUID v4 regex
// pins the random-mint contract (crypto.randomUUID), the returned string pins
// the concrete unit identity
const mintedId = (chip: HTMLElement): string => {
    const id = chipId(chip);
    expect(id).toMatch(UUID_V4);
    return id;
};

// ---------------------------------------------------------------------------
// Generic lookup — a missing node is a bug, never an expected outcome
// ---------------------------------------------------------------------------

const must = <T extends Element>(selector: string): T => {
    const node = document.querySelector<T>(selector);
    if (!node) throw new Error(`missing element: ${selector}`);
    return node;
};

// One group's entries from a parsed grouped view — a missing group is a bug.
// Used for key-ORDER pins (toEqual is order-insensitive, JSON.parse preserves
// the serialized key order).
const groupEntries = (view: GroupedView, label: string): UnitEntry[] => {
    const entries = view[label];
    if (!entries) throw new Error(`grouped view has no "${label}" group`);
    return entries;
};

// ---------------------------------------------------------------------------
// jsdom DnD mechanics — no real DataTransfer exists, so every drag event
// carries this stub: getData(type) serves the payload for 'text/plain' (''
// when none given), setData is a vi.fn() spy, effectAllowed starts '' and
// main.ts must flip it to 'move' on dragstart.
// ---------------------------------------------------------------------------

const stubTransfer = (payload?: string) => ({
    getData: (type: string) => (type === 'text/plain' ? (payload ?? '') : ''),
    setData: vi.fn(),
    effectAllowed: '',
});

const fire = (element: Element, type: string, transfer: unknown): Event => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: transfer });
    element.dispatchEvent(event);
    return event;
};

// ---------------------------------------------------------------------------
// Icon-grid lookups
// ---------------------------------------------------------------------------

const stackGroup = (owner: OwnerId, label: string): HTMLElement => {
    const group = document.querySelector<HTMLElement>(
        `#${owner}-bag .stack-group[data-label="${label}"]`
    );
    if (!group) throw new Error(`missing stack-group "${label}" for ${owner}`);
    return group;
};

// Group order = bag-key order, then sidecar-only labels (groupedUnitsView)
const groupOrder = (owner: OwnerId): string[] =>
    Array.from(document.querySelectorAll<HTMLElement>(`#${owner}-bag .stack-group`)).map(
        (group) => group.dataset.label ?? ''
    );

const headText = (group: HTMLElement, className: string): string => {
    const node = group.querySelector<HTMLElement>(`.stack-head .${className}`);
    if (!node) throw new Error(`missing .stack-head .${className}`);
    return node.textContent ?? '';
};

const chipsOf = (group: HTMLElement): HTMLElement[] =>
    Array.from(group.querySelectorAll<HTMLElement>('.stack-chips .chip'));

// Full per-chip snapshot — asserted with toEqual against exact literals (ids
// interpolated from RUNTIME captures), so any drift (dataset, draggable,
// tabindex, aria-label, tooltip, emoji, aria-hidden/role) fails the test.
// The optional data-instance-id is NOT part of this snapshot: plain chips
// must have it ABSENT, which toEqual on an undefined field could not
// distinguish — tracked ids are asserted per chip via mintedId/chipId, plain
// absence via hasAttribute(...).
const chipInfo = (chip: HTMLElement) => ({
    from: chip.dataset.from,
    kind: chip.dataset.kind,
    label: chip.dataset.label,
    draggable: chip.getAttribute('draggable'),
    tabIndex: chip.tabIndex,
    ariaLabel: chip.getAttribute('aria-label'),
    icon: chip.querySelector('.chip-icon')?.textContent,
    iconHidden: chip.querySelector('.chip-icon')?.getAttribute('aria-hidden'),
    tooltip: chip.querySelector('.tooltip')?.textContent,
    tooltipRole: chip.querySelector('.tooltip')?.getAttribute('role'),
});

// ---------------------------------------------------------------------------
// JSON readers — grouped per-unit view + raw wrapped-original. Verbatim text
// accessors exist for byte-identity checks (a parsed toEqual could miss
// formatting-only drift; textContent cannot).
// ---------------------------------------------------------------------------

const groupedJson = (owner: OwnerId): GroupedView =>
    JSON.parse(must(`#${owner}-json pre.json-view.json-grouped`).textContent ?? '') as GroupedView;

const rawJson = (owner: OwnerId): RawBag =>
    JSON.parse(must(`#${owner}-json pre.json-view.json-raw`).textContent ?? '') as RawBag;

const groupedJsonText = (owner: OwnerId): string =>
    must(`#${owner}-json pre.json-view.json-grouped`).textContent ?? '';

const rawJsonText = (owner: OwnerId): string =>
    must(`#${owner}-json pre.json-view.json-raw`).textContent ?? '';

// [0] grouped heading, [1] raw heading — exactly two per owner
const jsonLabelTexts = (owner: OwnerId): [string, string] => {
    const labels = Array.from(document.querySelectorAll<HTMLElement>(`#${owner}-json .json-label`));
    if (labels.length !== 2) {
        throw new Error(`expected 2 JSON labels for ${owner}, got ${labels.length}`);
    }
    return [labels[0].textContent ?? '', labels[1].textContent ?? ''];
};

// Whole-UI snapshot for no-op assertions: both icon grids' outerHTML plus all
// four verbatim JSON texts. Any re-render drift or data mutation changes at
// least one of these six strings.
const snapshotUi = () => ({
    heroGrid: must('#hero-bag .icon-grid').outerHTML,
    merchantGrid: must('#merchant-bag .icon-grid').outerHTML,
    heroGrouped: groupedJsonText('hero'),
    merchantGrouped: groupedJsonText('merchant'),
    heroRaw: rawJsonText('hero'),
    merchantRaw: rawJsonText('merchant'),
});

// Drain helper for the empty-bag path: drops the OLDEST tracked chip of one
// owner label onto the merchant panel. The minted id is read off the CURRENT
// DOM right before the drop (ids are random and every transfer re-renders
// both grids, so stale references are useless), the exact identity payload
// (literal key order, captured id) is fired, and the id is returned as an
// exact test value for the post-transfer assertions.
const dropOldestTrackedToMerchant = (from: OwnerId, label: string): string => {
    const chip = must(`#${from}-bag .stack-group[data-label="${label}"] .chip.tracked`);
    const id = mintedId(chip);
    fire(
        must('#merchant-panel'),
        'drop',
        stubTransfer(`{"from":"${from}","kind":"tracked","id":"${id}","label":"${label}"}`)
    );
    return id;
};

// ---------------------------------------------------------------------------
// Boot the real app per test (vi.resetModules → fresh module execution —
// including FRESH random ids every test; nothing below may depend on a
// concrete minted value, only on captured ones)
// ---------------------------------------------------------------------------

// The timeout argument: the fresh ./main import below boots the whole demo
// app (module re-execution with fresh minted ids). Under a parallel turbo
// run the boot regularly exceeds vitest's default 10s hookTimeout, so the
// hook carries its own generous ceiling.
beforeEach(async () => {
    vi.resetModules();
    document.body.innerHTML = SHELL_HTML;
    await import('./main');
}, 60_000);

// ---------------------------------------------------------------------------
// 1 — title
// ---------------------------------------------------------------------------

describe('title', () => {
    it('sets #demo-title textContent AND document.title to the versioned title', () => {
        expect(must('#demo-title').textContent).toBe('Userfiction Inventory v1.0.2');
        expect(document.title).toBe('Userfiction Inventory v1.0.2');
    });
});

// ---------------------------------------------------------------------------
// 2 — initial hero icon grid
// ---------------------------------------------------------------------------

describe('initial hero icon grid', () => {
    it('renders berries ×2 then swords ×2 with minted ids and one named sword chip', () => {
        // Bag-key order: heroBag ends as { berries: 2, swords: 2 } — the
        // counts are minted by addInstance at boot; the sidecar adds no new
        // labels, so the group order is exactly these two
        expect(groupOrder('hero')).toEqual(['berries', 'swords']);
        // Units exist → no empty-bag note anywhere in the hero mount
        expect(document.querySelector('#hero-bag .empty-note')).toBeNull();

        const berries = stackGroup('hero', 'berries');
        expect(headText(berries, 'stack-name')).toBe('berries');
        expect(headText(berries, 'stack-count')).toBe('×2');
        expect(headText(berries, 'stack-icon')).toBe('🫐');
        const berryChips = chipsOf(berries);
        const berryId0 = mintedId(berryChips[0]); // seeded first → freshness 0.9
        const berryId1 = mintedId(berryChips[1]); // seeded second → freshness 0.4
        expect(berryChips.map(chipInfo)).toEqual([
            {
                from: 'hero',
                kind: 'tracked',
                label: 'berries',
                draggable: 'true',
                tabIndex: 0,
                ariaLabel: `${berryId0} (berries) — drag to another inventory`,
                icon: '🫐',
                iconHidden: 'true',
                tooltip: `${berryId0} · freshness 0.9`,
                tooltipRole: 'tooltip',
            },
            {
                from: 'hero',
                kind: 'tracked',
                label: 'berries',
                draggable: 'true',
                tabIndex: 0,
                ariaLabel: `${berryId1} (berries) — drag to another inventory`,
                icon: '🫐',
                iconHidden: 'true',
                tooltip: `${berryId1} · freshness 0.4`,
                tooltipRole: 'tooltip',
            },
        ]);

        const swords = stackGroup('hero', 'swords');
        expect(headText(swords, 'stack-name')).toBe('swords');
        expect(headText(swords, 'stack-count')).toBe('×2');
        expect(headText(swords, 'stack-icon')).toBe('🗡️');
        const swordChips = chipsOf(swords);
        const dawnbreakerId = mintedId(swordChips[0]); // oldest sidecar entry — THE named one
        const plainSwordId = mintedId(swordChips[1]); // unnamed sibling (durability 3)
        expect(swordChips.map(chipInfo)).toEqual([
            {
                from: 'hero',
                kind: 'tracked',
                label: 'swords',
                draggable: 'true',
                tabIndex: 0,
                ariaLabel: `${dawnbreakerId} (swords) — drag to another inventory`,
                icon: '🗡️',
                iconHidden: 'true',
                // Named unit: tooltip is id · NAME · stats (unitNames map)
                tooltip: `${dawnbreakerId} · Dawnbreaker · durability 10`,
                tooltipRole: 'tooltip',
            },
            {
                from: 'hero',
                kind: 'tracked',
                label: 'swords',
                draggable: 'true',
                tabIndex: 0,
                ariaLabel: `${plainSwordId} (swords) — drag to another inventory`,
                icon: '🗡️',
                iconHidden: 'true',
                // Unnamed unit: NO name segment — just id · stats
                tooltip: `${plainSwordId} · durability 3`,
                tooltipRole: 'tooltip',
            },
        ]);

        // Minted ids never repeat within a label — and all four hero ids are
        // distinct across labels too
        expect(berryId0).not.toBe(berryId1);
        expect(new Set([berryId0, berryId1, dawnbreakerId, plainSwordId]).size).toBe(4);
    });
});

// ---------------------------------------------------------------------------
// 3 — initial merchant icon grid
// ---------------------------------------------------------------------------

describe('initial merchant icon grid', () => {
    it('renders rope ×4 (plain), lantern ×1 (plain), swords ×1 (tracked, named)', () => {
        // Bag-key order: merchantBag = { rope: 4, lantern: 1, swords: 1 }
        expect(groupOrder('merchant')).toEqual(['rope', 'lantern', 'swords']);

        const rope = stackGroup('merchant', 'rope');
        expect(headText(rope, 'stack-name')).toBe('rope');
        expect(headText(rope, 'stack-count')).toBe('×4');
        expect(headText(rope, 'stack-icon')).toBe('🪢');
        const ropeChips = chipsOf(rope);
        const plainRopeChip = {
            from: 'merchant',
            kind: 'plain',
            label: 'rope',
            draggable: 'true',
            tabIndex: 0,
            ariaLabel: 'plain rope unit — drag to another inventory',
            icon: '🪢',
            iconHidden: 'true',
            tooltip: 'plain rope unit — no id, no stats',
            tooltipRole: 'tooltip',
        };
        // Four plain units → four identical plain chips; the tracked-first
        // rule never applies (rope has no tracked instances)
        expect(ropeChips.map(chipInfo)).toEqual([
            plainRopeChip,
            plainRopeChip,
            plainRopeChip,
            plainRopeChip,
        ]);
        // Plain units carry NO identity in the package — no data-instance-id
        ropeChips.forEach((chip) => {
            expect(chip.hasAttribute('data-instance-id')).toBe(false);
        });

        const lantern = stackGroup('merchant', 'lantern');
        expect(headText(lantern, 'stack-name')).toBe('lantern');
        expect(headText(lantern, 'stack-count')).toBe('×1');
        expect(headText(lantern, 'stack-icon')).toBe('🏮');
        const lanternChips = chipsOf(lantern);
        expect(lanternChips.map(chipInfo)).toEqual([
            {
                from: 'merchant',
                kind: 'plain',
                label: 'lantern',
                draggable: 'true',
                tabIndex: 0,
                ariaLabel: 'plain lantern unit — drag to another inventory',
                icon: '🏮',
                iconHidden: 'true',
                tooltip: 'plain lantern unit — no id, no stats',
                tooltipRole: 'tooltip',
            },
        ]);
        expect(lanternChips[0].hasAttribute('data-instance-id')).toBe(false);

        const swords = stackGroup('merchant', 'swords');
        expect(headText(swords, 'stack-name')).toBe('swords');
        expect(headText(swords, 'stack-count')).toBe('×1');
        expect(headText(swords, 'stack-icon')).toBe('🗡️');
        const swordChips = chipsOf(swords);
        const merchantSwordId = mintedId(swordChips[0]);
        expect(swordChips.map(chipInfo)).toEqual([
            {
                from: 'merchant',
                kind: 'tracked',
                label: 'swords',
                draggable: 'true',
                tabIndex: 0,
                ariaLabel: `${merchantSwordId} (swords) — drag to another inventory`,
                icon: '🗡️',
                iconHidden: 'true',
                // Named 'Honest steel' via the demo's unitNames map
                tooltip: `${merchantSwordId} · Honest steel · durability 7`,
                tooltipRole: 'tooltip',
            },
        ]);
    });
});

// ---------------------------------------------------------------------------
// 4 — initial JSON views
// ---------------------------------------------------------------------------

describe('initial JSON views', () => {
    it('shows the exact grouped per-unit view and raw wrapped-original per owner', () => {
        // Capture the minted ids off the chips FIRST: the icon grid and the
        // grouped JSON are built from the SAME groupedUnitsView() object, so
        // DOM ids and JSON ids must match exactly
        const berryChips = chipsOf(stackGroup('hero', 'berries'));
        const berryId0 = mintedId(berryChips[0]);
        const berryId1 = mintedId(berryChips[1]);
        const heroSwordChips = chipsOf(stackGroup('hero', 'swords'));
        const dawnbreakerId = mintedId(heroSwordChips[0]);
        const plainSwordId = mintedId(heroSwordChips[1]);
        const merchantSwordId = mintedId(chipsOf(stackGroup('merchant', 'swords'))[0]);

        const heroView = groupedJson('hero');
        expect(heroView).toEqual({
            berries: [
                { id: berryId0, stats: { freshness: 0.9 } },
                { id: berryId1, stats: { freshness: 0.4 } },
            ],
            swords: [
                // PROPOSED entry shape: named unit carries id + name + stats
                { id: dawnbreakerId, name: 'Dawnbreaker', stats: { durability: 10 } },
                // the unnamed sibling carries NO `name` key at all
                { id: plainSwordId, stats: { durability: 3 } },
            ],
        });
        // Key-ORDER pins (toEqual is order-insensitive): id → name? → stats,
        // exactly as JSON.stringify serialized the view
        expect(Object.keys(groupEntries(heroView, 'swords')[0])).toEqual(['id', 'name', 'stats']);
        expect(Object.keys(groupEntries(heroView, 'swords')[1])).toEqual(['id', 'stats']);
        expect('name' in groupEntries(heroView, 'swords')[1]).toBe(false);
        expect(Object.keys(groupEntries(heroView, 'berries')[0])).toEqual(['id', 'stats']);

        const merchantView = groupedJson('merchant');
        expect(merchantView).toEqual({
            // Plain units (nothing to track) are one EMPTY `{}` entry each
            rope: [{}, {}, {}, {}],
            lantern: [{}],
            swords: [{ id: merchantSwordId, name: 'Honest steel', stats: { durability: 7 } }],
        });
        expect(Object.keys(groupEntries(merchantView, 'swords')[0])).toEqual([
            'id',
            'name',
            'stats',
        ]);

        expect(rawJson('hero')).toEqual({ berries: 2, swords: 2 });
        expect(rawJson('merchant')).toEqual({ rope: 4, lantern: 1, swords: 1 });
        expect(jsonLabelTexts('hero')).toEqual([
            'inventory JSON — hero (grouped by item · one entry per unit)',
            'raw bag JSON — wrapped original (counts only)',
        ]);
        expect(jsonLabelTexts('merchant')).toEqual([
            'inventory JSON — merchant (grouped by item · one entry per unit)',
            'raw bag JSON — wrapped original (counts only)',
        ]);
    });
});

// ---------------------------------------------------------------------------
// 5 — dragstart payloads (identity only, exact key order)
// ---------------------------------------------------------------------------

describe('dragstart payloads', () => {
    it('tracked chip writes the identity payload (random id) and sets effectAllowed', () => {
        // First tracked sword chip = sidecar insertion order = 'Dawnbreaker'
        const dawnbreakerId = mintedId(
            must('#hero-bag .stack-group[data-label="swords"] .chip.tracked')
        );
        const transfer = stubTransfer();
        fire(must(`#hero-bag .chip[data-instance-id="${dawnbreakerId}"]`), 'dragstart', transfer);
        expect(transfer.setData).toHaveBeenCalledTimes(1);
        expect(transfer.setData.mock.calls[0][0]).toBe('text/plain');
        // The tracked payload embeds a RANDOM id, so the exact setData string
        // is not predictable — assert the PARSED payload instead: exact key
        // order + exact values with the captured id
        const payload = JSON.parse(transfer.setData.mock.calls[0][1]);
        expect(Object.keys(payload)).toEqual(['from', 'kind', 'id', 'label']);
        expect(payload).toEqual({ from: 'hero', kind: 'tracked', id: dawnbreakerId, label: 'swords' });
        expect(transfer.effectAllowed).toBe('move');
    });

    it('plain chip writes the exact count-mover payload and sets effectAllowed', () => {
        const chip = must('#merchant-bag .stack-group[data-label="rope"] .chip.plain');
        const transfer = stubTransfer();
        fire(chip, 'dragstart', transfer);
        expect(transfer.setData).toHaveBeenCalledTimes(1);
        // Plain payload carries NO id — fully literal-exact
        expect(transfer.setData).toHaveBeenCalledWith(
            'text/plain',
            '{"from":"merchant","kind":"plain","label":"rope"}'
        );
        expect(transfer.effectAllowed).toBe('move');
    });
});

// ---------------------------------------------------------------------------
// 6 — tracked transfer (drop on the other panel)
// ---------------------------------------------------------------------------

describe('tracked transfer', () => {
    it('moves the oldest hero sword to the merchant with identity, stats AND name intact', () => {
        // Capture EVERY id before the drop mutates and re-renders both grids
        const berryChips = chipsOf(stackGroup('hero', 'berries'));
        const berryId0 = mintedId(berryChips[0]);
        const berryId1 = mintedId(berryChips[1]);
        const dawnbreakerId = mintedId(
            must('#hero-bag .stack-group[data-label="swords"] .chip.tracked')
        );
        const merchantSwordId = mintedId(
            must('#merchant-bag .stack-group[data-label="swords"] .chip.tracked')
        );

        const drop = fire(
            must('#merchant-panel'),
            'drop',
            // Payload built from the RUNTIME-CAPTURED id — literal key order
            stubTransfer(`{"from":"hero","kind":"tracked","id":"${dawnbreakerId}","label":"swords"}`)
        );
        // drop must preventDefault or the browser would navigate away
        expect(drop.defaultPrevented).toBe(true);

        // Hero keeps exactly one tracked sword (×1) — the durability-3 one
        const heroSwords = stackGroup('hero', 'swords');
        expect(headText(heroSwords, 'stack-count')).toBe('×1');
        const heroSwordChips = chipsOf(heroSwords);
        const remainingSwordId = mintedId(heroSwordChips[0]);
        expect(heroSwordChips.map(chipInfo)).toEqual([
            {
                from: 'hero',
                kind: 'tracked',
                label: 'swords',
                draggable: 'true',
                tabIndex: 0,
                ariaLabel: `${remainingSwordId} (swords) — drag to another inventory`,
                icon: '🗡️',
                iconHidden: 'true',
                tooltip: `${remainingSwordId} · durability 3`,
                tooltipRole: 'tooltip',
            },
        ]);
        // The moved chip is gone from the hero grid
        expect(
            document.querySelector(`#hero-bag .chip[data-instance-id="${dawnbreakerId}"]`)
        ).toBeNull();

        // Merchant renders the newcomer AFTER its own sword (sidecar
        // insertion order); the grid is re-rendered under the merchant owner,
        // so data-from flips to 'merchant' — AND the name travels with the
        // unit (the global unitNames map is keyed by the minted id)
        const merchantSwords = stackGroup('merchant', 'swords');
        expect(headText(merchantSwords, 'stack-count')).toBe('×2');
        const merchantSwordChips = chipsOf(merchantSwords);
        expect(merchantSwordChips.map(chipInfo)).toEqual([
            {
                from: 'merchant',
                kind: 'tracked',
                label: 'swords',
                draggable: 'true',
                tabIndex: 0,
                ariaLabel: `${merchantSwordId} (swords) — drag to another inventory`,
                icon: '🗡️',
                iconHidden: 'true',
                tooltip: `${merchantSwordId} · Honest steel · durability 7`,
                tooltipRole: 'tooltip',
            },
            {
                from: 'merchant',
                kind: 'tracked',
                label: 'swords',
                draggable: 'true',
                tabIndex: 0,
                ariaLabel: `${dawnbreakerId} (swords) — drag to another inventory`,
                icon: '🗡️',
                iconHidden: 'true',
                tooltip: `${dawnbreakerId} · Dawnbreaker · durability 10`,
                tooltipRole: 'tooltip',
            },
        ]);
        // The SAME minted identity crossed owners
        expect(merchantSwordChips[1].dataset.instanceId).toBe(dawnbreakerId);

        // Both JSON views reflect the exchange — id + stats + NAME intact
        const heroView = groupedJson('hero');
        expect(heroView).toEqual({
            berries: [
                { id: berryId0, stats: { freshness: 0.9 } },
                { id: berryId1, stats: { freshness: 0.4 } },
            ],
            swords: [{ id: remainingSwordId, stats: { durability: 3 } }],
        });
        expect(Object.keys(groupEntries(heroView, 'swords')[0])).toEqual(['id', 'stats']);

        const merchantView = groupedJson('merchant');
        expect(merchantView).toEqual({
            // Plain rope/lantern entries stay {} — only the tracked swords changed
            rope: [{}, {}, {}, {}],
            lantern: [{}],
            swords: [
                { id: merchantSwordId, name: 'Honest steel', stats: { durability: 7 } },
                // 'Dawnbreaker' moved WITH the unit — name follows the id
                { id: dawnbreakerId, name: 'Dawnbreaker', stats: { durability: 10 } },
            ],
        });
        expect(Object.keys(groupEntries(merchantView, 'swords')[1])).toEqual([
            'id',
            'name',
            'stats',
        ]);

        expect(rawJson('hero')).toEqual({ berries: 2, swords: 1 });
        expect(rawJson('merchant')).toEqual({ rope: 4, lantern: 1, swords: 2 });
    });
});

// ---------------------------------------------------------------------------
// 7 — plain transfer (drop on the other panel)
// ---------------------------------------------------------------------------

describe('plain transfer', () => {
    it('moves one plain rope unit from merchant to hero (plain-first consumption)', () => {
        // Capture ids before the drop re-renders everything
        const berryChips = chipsOf(stackGroup('hero', 'berries'));
        const berryId0 = mintedId(berryChips[0]);
        const berryId1 = mintedId(berryChips[1]);
        const heroSwordChips = chipsOf(stackGroup('hero', 'swords'));
        const dawnbreakerId = mintedId(heroSwordChips[0]);
        const plainSwordId = mintedId(heroSwordChips[1]);
        const merchantSwordId = mintedId(
            must('#merchant-bag .stack-group[data-label="swords"] .chip.tracked')
        );

        const drop = fire(
            must('#hero-panel'),
            'drop',
            stubTransfer('{"from":"merchant","kind":"plain","label":"rope"}')
        );
        expect(drop.defaultPrevented).toBe(true);

        // Hero gains a rope group (×1) with ONE plain chip; add() creates the
        // new bag key at the end → group order berries, swords, rope
        expect(groupOrder('hero')).toEqual(['berries', 'swords', 'rope']);
        const heroRope = stackGroup('hero', 'rope');
        expect(headText(heroRope, 'stack-count')).toBe('×1');
        const heroRopeChips = chipsOf(heroRope);
        expect(heroRopeChips.map(chipInfo)).toEqual([
            {
                from: 'hero',
                kind: 'plain',
                label: 'rope',
                draggable: 'true',
                tabIndex: 0,
                ariaLabel: 'plain rope unit — drag to another inventory',
                icon: '🪢',
                iconHidden: 'true',
                tooltip: 'plain rope unit — no id, no stats',
                tooltipRole: 'tooltip',
            },
        ]);
        expect(heroRopeChips[0].hasAttribute('data-instance-id')).toBe(false);

        // Merchant is down to three plain rope chips (plain-first consumption
        // removed a plain unit, never the tracked sword)
        const merchantRope = stackGroup('merchant', 'rope');
        expect(headText(merchantRope, 'stack-count')).toBe('×3');
        const merchantRopeChips = chipsOf(merchantRope);
        const remainingPlainRopeChip = {
            from: 'merchant',
            kind: 'plain',
            label: 'rope',
            draggable: 'true',
            tabIndex: 0,
            ariaLabel: 'plain rope unit — drag to another inventory',
            icon: '🪢',
            iconHidden: 'true',
            tooltip: 'plain rope unit — no id, no stats',
            tooltipRole: 'tooltip',
        };
        expect(merchantRopeChips.map(chipInfo)).toEqual([
            remainingPlainRopeChip,
            remainingPlainRopeChip,
            remainingPlainRopeChip,
        ]);

        expect(groupedJson('hero')).toEqual({
            berries: [
                { id: berryId0, stats: { freshness: 0.9 } },
                { id: berryId1, stats: { freshness: 0.4 } },
            ],
            swords: [
                { id: dawnbreakerId, name: 'Dawnbreaker', stats: { durability: 10 } },
                { id: plainSwordId, stats: { durability: 3 } },
            ],
            rope: [{}],
        });
        expect(groupedJson('merchant')).toEqual({
            rope: [{}, {}, {}],
            lantern: [{}],
            swords: [{ id: merchantSwordId, name: 'Honest steel', stats: { durability: 7 } }],
        });
        expect(rawJson('hero')).toEqual({ berries: 2, swords: 2, rope: 1 });
        expect(rawJson('merchant')).toEqual({ rope: 3, lantern: 1, swords: 1 });
    });
});

// ---------------------------------------------------------------------------
// 8 — refused / no-op drops leave the whole UI byte-identical
// ---------------------------------------------------------------------------

describe('refused drops are silent no-ops', () => {
    it('dropping a chip on its own panel changes nothing', () => {
        // Same-owner tracked payload built from a REAL captured minted id —
        // refused purely by the from === target.id guard
        const dawnbreakerId = mintedId(
            must('#hero-bag .stack-group[data-label="swords"] .chip.tracked')
        );
        const before = snapshotUi();
        const drop = fire(
            must('#hero-panel'),
            'drop',
            stubTransfer(`{"from":"hero","kind":"tracked","id":"${dawnbreakerId}","label":"swords"}`)
        );
        expect(drop.defaultPrevented).toBe(true);
        expect(snapshotUi()).toEqual(before);
    });

    it('a garbage (unparseable) payload changes nothing', () => {
        const before = snapshotUi();
        const drop = fire(must('#merchant-panel'), 'drop', stubTransfer('not-json'));
        expect(drop.defaultPrevented).toBe(true);
        expect(snapshotUi()).toEqual(before);
    });

    it('a tracked payload whose id is missing from the source sidecar changes nothing', () => {
        // Well-shaped UUID v4 id that was NEVER minted this session — valid
        // payload shape (a non-empty string is all the parser requires),
        // unknown identity → the own-key lookup refuses
        const before = snapshotUi();
        const drop = fire(
            must('#merchant-panel'),
            'drop',
            stubTransfer(
                '{"from":"hero","kind":"tracked","id":"00000000-0000-4000-8000-000000000000","label":"swords"}'
            )
        );
        expect(drop.defaultPrevented).toBe(true);
        expect(snapshotUi()).toEqual(before);
    });

    it('a tracked payload from an unknown owner changes nothing', () => {
        const before = snapshotUi();
        const drop = fire(
            must('#hero-panel'),
            'drop',
            stubTransfer(
                '{"from":"dragon","kind":"tracked","id":"deadbeef-dead-4ead-beef-deadbeefdead","label":"swords"}'
            )
        );
        expect(drop.defaultPrevented).toBe(true);
        expect(snapshotUi()).toEqual(before);
    });
});

// ---------------------------------------------------------------------------
// 9 — drop-target highlight lifecycle
// ---------------------------------------------------------------------------

describe('drop-target highlight lifecycle', () => {
    it('dragover highlights the panel; dragleave and drop clear it', () => {
        const panel = must('#merchant-panel');

        // dragover MUST preventDefault or the browser never fires drop
        const over = fire(panel, 'dragover', stubTransfer());
        expect(over.defaultPrevented).toBe(true);
        expect(panel.classList.contains('drop-target')).toBe(true);

        fire(panel, 'dragleave', stubTransfer());
        expect(panel.classList.contains('drop-target')).toBe(false);

        // Highlight again, then a (no-op garbage) drop must still clear it
        fire(panel, 'dragover', stubTransfer());
        expect(panel.classList.contains('drop-target')).toBe(true);
        const drop = fire(panel, 'drop', stubTransfer('not-json'));
        expect(drop.defaultPrevented).toBe(true);
        expect(panel.classList.contains('drop-target')).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// 10 — empty-bag rendering (reachable only via chained tracked drops)
// ---------------------------------------------------------------------------

describe('empty-bag rendering', () => {
    // The static seed offers no mutation path besides drag & drop, so the
    // empty state is only reachable by dragging every hero unit to the
    // merchant — this test walks exactly that deterministic user path. Each
    // payload is built from a RUNTIME-CAPTURED id read off the current DOM
    // right before its drop (see dropOldestTrackedToMerchant).
    it('a fully drained owner renders the empty-bag note and {} JSON views', () => {
        // Merchant's own named sword id, captured BEFORE any mutation
        const merchantSwordId = mintedId(
            must('#merchant-bag .stack-group[data-label="swords"] .chip.tracked')
        );

        // Drain the hero oldest-first: berries (0.9, 0.4) then swords (10, 3)
        const berryId0 = dropOldestTrackedToMerchant('hero', 'berries');
        const berryId1 = dropOldestTrackedToMerchant('hero', 'berries');
        const dawnbreakerId = dropOldestTrackedToMerchant('hero', 'swords');
        const plainSwordId = dropOldestTrackedToMerchant('hero', 'swords');

        // Hero bag {} + emptied sidecar → icon grid replaced by the note,
        // and both JSON views collapse to '{}'
        expect(must('#hero-bag p.empty-note').textContent).toBe('empty bag');
        expect(document.querySelector('#hero-bag .icon-grid')).toBeNull();
        expect(groupedJsonText('hero')).toBe('{}');
        expect(rawJsonText('hero')).toBe('{}');

        // Merchant absorbed all four hero units under their OWN labels
        // (labels never merge — berries stay berries), names traveling with
        // the units via the global unitNames map. Group order: bag-key order
        // rope, lantern, swords, then the berries key created by the first
        // berry transfer. Sidecar insertion order: its own sword first, then
        // the newcomers in drop order.
        expect(groupOrder('merchant')).toEqual(['rope', 'lantern', 'swords', 'berries']);
        // ×3 = its own sword + the two transferred hero swords (the two
        // berries live in their own group below, not in swords)
        expect(headText(stackGroup('merchant', 'swords'), 'stack-count')).toBe('×3');
        expect(headText(stackGroup('merchant', 'berries'), 'stack-count')).toBe('×2');
        expect(groupedJson('merchant')).toEqual({
            rope: [{}, {}, {}, {}],
            lantern: [{}],
            swords: [
                { id: merchantSwordId, name: 'Honest steel', stats: { durability: 7 } },
                { id: dawnbreakerId, name: 'Dawnbreaker', stats: { durability: 10 } },
                { id: plainSwordId, stats: { durability: 3 } },
            ],
            berries: [
                { id: berryId0, stats: { freshness: 0.9 } },
                { id: berryId1, stats: { freshness: 0.4 } },
            ],
        });
        expect(rawJson('merchant')).toEqual({ rope: 4, lantern: 1, swords: 3, berries: 2 });
    });
});
