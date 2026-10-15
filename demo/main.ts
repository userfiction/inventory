// ============================================================================
// demo/main.ts — presentation-only UI over the public facade
// ============================================================================
// The UI is ONE WAY TO PRESENT the inventory data: items render as draggable
// ICONS (one chip per unit — the exact same per-unit arrays the JSON shows),
// hovering/focusing a chip reveals its details in a tooltip, and dragging a
// chip onto ANOTHER inventory panel exchanges that unit between the two
// inventories (tracked instances move with identity + stats intact; plain
// units move as counts). The derived JSON views sit directly under each
// inventory — see renderIcons(): the icon grid is built from the SAME
// groupedUnitsView() object the JSON block stringifies, so icons and JSON can
// never disagree.
//
// The demo consumes ONLY the public barrel API via a RELATIVE import
// ('../index' — demo:build never depends on a prior library build):
// createUserInventory + the Inventory / InventoryInstance / InventoryInstances
// types. The package version for the title comes straight from
// ../package.json (resolveJsonModule).
//
// The facade deliberately exposes NO read methods: createUserInventory closes
// over the ORIGINAL objects and every mutation writes them in place. Reads go
// straight to the caller-owned bag + instance sidecar below — "the caller's
// object IS the inventory".
//
// DATA MODEL (unchanged): aggregate counts stay `Record<label, count>`; an
// optional caller-owned instance SIDECAR tracks identified units underneath
// those counts with opaque stats payloads (stored by reference, never
// interpreted here). Counted removals consume plain units first, then tracked
// instances oldest-first — the plain `{}` chip icons only exist while
// plain ≥ 1, which the drag & drop path relies on (see applyTransfer).
//
// ADDING MORE INVENTORIES: the whole app is data-driven off the `owners`
// array — to add a third inventory, copy one <section class="panel"> in
// index.html (unique id + aria-label) and add one `owners` entry here. Two
// are available for now.
//
// A11y baseline: chips are focusable (tabindex=0) and show their tooltip on
// :hover AND :focus-visible; visible focus outline + prefers-reduced-motion
// respected in styles.css; all dynamic text rendered via textContent — no
// innerHTML anywhere. HTML5 drag & drop is pointer-only by nature; keyboard
// users still get full tooltip inspection (transfer via keyboard is out of
// scope for this demo).
// ============================================================================

import { createUserInventory } from '../index';
import type { Inventory, InventoryInstance, InventoryInstances } from '../index';
// The title shows the package version straight from the source of truth
import { version } from '../package.json';

// ----------------------------------------------------------------------------
// Shell wiring
// ----------------------------------------------------------------------------

// The static shell (index.html) must provide these mounts; a missing id is a
// build/shell bug, so fail loudly at startup rather than degrade silently.
function mustGet(id: string): HTMLElement {
    const element = document.getElementById(id);
    if (!element) throw new Error(`demo shell is missing #${id}`);
    return element;
}

// Prototype-safe own-key check (ids like 'toString' must not resolve through
// Object.prototype when looking up sidecar records during a drop).
function hasOwn(target: object, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(target, key);
}

// ----------------------------------------------------------------------------
// Title — "Userfiction Inventory vX.X.X" from package.json
// ----------------------------------------------------------------------------

const versionTitle = `Userfiction Inventory v${version}`;
mustGet('demo-title').textContent = versionTitle;
document.title = versionTitle;

// ----------------------------------------------------------------------------
// State — two plain bags + two caller-owned instance sidecars, wrapped
// ----------------------------------------------------------------------------

// Aggregate counts: plain stock at boot; tracked instances are seeded
// THROUGH the controller below (each addInstance bumps its label's count by
// 1), so the wrapped originals end up identical to hand-written bags:
// hero { berries: 2, swords: 2 }, merchant { rope: 4, lantern: 1, swords: 1 }.
const heroBag: Inventory = {};
const merchantBag: Inventory = { rope: 4, lantern: 1 };

// Caller-owned instance sidecars, filled through the controllers: tracked
// ids are MINTED RANDOMLY (see src/user-inventory.ts mintId) — opaque
// tracking handles with no semantic content, kept purely for saving/loading
// (in memory, object references ARE the identity). Stats payloads are
// demo-owned data the package stores untouched.
const heroInstances: InventoryInstances = {};
const merchantInstances: InventoryInstances = {};

// Demo-owned DISPLAY NAMES for a few units — the PROPOSED listing entry
// type `{ id, name?, stats }` in action: `name` appears only when a unit
// has a name beyond the json label (an identified sword can be
// "Dawnbreaker"; its nameless siblings simply omit the key). Keyed by the
// minted random id in ONE global map (ids are unique across owners), so a
// name travels with its unit through drag & drop transfers. The package
// itself stores no names — this is presentation data.
const unitNames: Record<string, string> = {};

const hero = createUserInventory(heroBag, heroInstances);
const merchant = createUserInventory(merchantBag, merchantInstances);

// Seeds one tracked instance and optionally names it. Refusal is impossible
// against fresh sidecars, so a null record here is a boot bug — throw loudly.
function seedInstance(
    controller: ReturnType<typeof createUserInventory>,
    label: string,
    stats: Record<string, number>,
    name?: string,
): void {
    const record = controller.addInstance(label, stats);
    if (!record) throw new Error(`demo seeding failed for ${label} — addInstance refused`);
    if (name !== undefined) unitNames[record.id] = name;
}

// Seeding order = sidecar insertion order = the deterministic consumption
// AND listing order: berries (0.9, 0.4) then swords (named 10, plain 3);
// the merchant gets one named sword. One named unit per owner demonstrates
// the optional `name` against its unnamed siblings of the same label.
seedInstance(hero, 'berries', { freshness: 0.9 });
seedInstance(hero, 'berries', { freshness: 0.4 });
seedInstance(hero, 'swords', { durability: 10 }, 'Dawnbreaker');
seedInstance(hero, 'swords', { durability: 3 });
seedInstance(merchant, 'swords', { durability: 7 }, 'Honest steel');

interface Owner {
    id: 'hero' | 'merchant';
    label: string;
    controller: ReturnType<typeof createUserInventory>;
    bag: Inventory;
    instances: InventoryInstances;
}

// THE extension point for more inventories: one entry per inventory panel.
const owners: ReadonlyArray<Owner> = [
    { id: 'hero', label: 'Hero', controller: hero, bag: heroBag, instances: heroInstances },
    {
        id: 'merchant',
        label: 'Merchant',
        controller: merchant,
        bag: merchantBag,
        instances: merchantInstances
    }
];

// Pure reads over the caller-owned objects (no facade read API by design):
// aggregate count (0 when absent) and the tracked instances of one label in
// sidecar insertion order (oldest first — the facade's consumption order).
function countOf(bag: Inventory, item: string): number {
    return bag[item] ?? 0;
}

function trackedOf(owner: Owner, label: string): InventoryInstance[] {
    return Object.values(owner.instances).filter((record) => record.label === label);
}

// ----------------------------------------------------------------------------
// Item icons — emoji per label (demo flavor only; unknown labels get a crate)
// ----------------------------------------------------------------------------

const ITEM_ICONS: Record<string, string> = {
    berries: '🫐',
    shells: '🐚',
    rope: '🪢',
    lantern: '🏮',
    wood: '🪵',
    coin: '🪙',
    potion: '🧪',
    feather: '🪶',
    swords: '🗡️',
    stone: '🪨'
};
const FALLBACK_ICON = '📦';

function itemIcon(label: string): string {
    return hasOwn(ITEM_ICONS, label) ? ITEM_ICONS[label] : FALLBACK_ICON;
}

// One readable stats line, e.g. "freshness 0.9 · durability 3" (numbers
// rounded to 2 decimals to dodge float dust like 0.30000000000000004).
function describeStats(stats: Record<string, unknown>): string {
    const entries = Object.entries(stats);
    if (entries.length === 0) return 'no stats';
    return entries
        .map(([key, value]) => {
            const rendered = typeof value === 'number' ? String(Math.round(value * 100) / 100) : String(value);
            return `${key} ${rendered}`;
        })
        .join(' · ');
}

// ----------------------------------------------------------------------------
// Grouped per-unit view — the single presentation source for icons AND JSON
// ----------------------------------------------------------------------------

// One entry per unit: tracked units carry AT LEAST AN ID — the random,
// opaque tracking handle, purely internal and used for saving/loading to
// re-sync everything (in memory, object references ARE the identity) —
// optionally the display NAME (only when the unit has a name beyond the
// json label; the PROPOSED listing shape) — plus the complete opaque stats
// payload; plain units with nothing to track are simply `{}` — no id, no
// name, no stats, no invented markers.
type TrackedEntry = { id: string; name?: string; stats: Record<string, unknown> };
type PlainEntry = Record<string, never>;
type UnitEntry = TrackedEntry | PlainEntry;

// Plain entries are the EMPTY object (nothing to track); tracked entries
// always carry at least the `id` handle, so key presence decides.
const isTrackedEntry = (entry: UnitEntry): entry is TrackedEntry =>
    Object.keys(entry).length > 0;

// Grouped per-label inventory view — DERIVED live from the two caller-owned
// sources (it is NOT a stored shape — the underlying bag stays
// `Record<label, count>`):
//   - the wrapped original bag → aggregate counts
//   - the caller-owned instance sidecar → tracked identities + opaque stats
// Per user decisions ("shouldn't allow number — array for item, even for
// item without number" and "simply have it {} if it got nothing to track"):
// a label value is NEVER a bare number; every label maps to an ARRAY of
// unit entries, one per unit. Tracked units show their random id (the
// tracking handle — pure save/load plumbing) plus the optional display
// `name` (PROPOSED shape) and their stats; plain units with nothing to
// track show `{}`. Zero-unit labels are omitted
// entirely (the bag primitive drops emptied keys and the sidecar then holds
// no records for them either).
// A direct caller write could desync bag and sidecar (existing API reality) —
// the view then shows the tracked entries plus a ≥ 0 number of plain `{}`
// entries (plain clamps at 0), which is exactly the truth of the two
// objects, never a smoothed-over fiction.
function groupedUnitsView(owner: Owner): Record<string, UnitEntry[]> {
    // Union of labels that hold at least one unit right now: non-zero bag
    // stacks plus every sidecar label (the sidecar alone decides tracked
    // membership; the bag alone decides the plain entry count).
    const labels = new Set<string>();
    Object.entries(owner.bag).forEach(([item, count]) => {
        if (count > 0) labels.add(item);
    });
    Object.values(owner.instances).forEach((record) => labels.add(record.label));

    const view: Record<string, UnitEntry[]> = {};
    labels.forEach((label) => {
        // Tracked entries first, in sidecar insertion order (oldest first —
        // the same deterministic order the facade consumes them in).
        const tracked = trackedOf(owner, label);
        // Plain remainder: aggregate count minus tracked units (≥ 0 while in
        // sync; clamped at 0 so a desync can never suggest negative counts).
        const plain = Math.max(0, countOf(owner.bag, label) - tracked.length);
        const entries: UnitEntry[] = tracked.map((instance) => {
            const name = unitNames[instance.id];
            // PROPOSED listing entry: the random tracking id, the display
            // name ONLY when the unit has one beyond the json label, then
            // the exact opaque stats payload reference ({} when none).
            return name === undefined
                ? { id: instance.id, stats: instance.stats }
                : { id: instance.id, name, stats: instance.stats };
        });
        // One empty `{}` entry PER plain unit (a fresh object each) — the
        // "item without number" units have nothing to track, so their entry
        // is nothing but the per-unit slot itself.
        for (let i = 0; i < plain; i += 1) {
            entries.push({});
        }
        view[label] = entries;
    });
    return view;
}

// ----------------------------------------------------------------------------
// Icon grid — items as draggable chips, details on hover/focus
// ----------------------------------------------------------------------------

// One chip per unit (from the SAME view object the JSON renders): tracked
// units are draggable with their identity in the dataset; plain `{}` entries
// are draggable count movers. The tooltip lives INSIDE the chip (CSS shows it on
// :hover/:focus-visible) and is rendered via textContent like everything else.
function renderIcons(host: HTMLElement, owner: Owner): void {
    host.replaceChildren();
    const view = groupedUnitsView(owner);
    const labels = Object.keys(view);

    if (labels.length === 0) {
        const note = document.createElement('p');
        note.className = 'empty-note';
        note.textContent = 'empty bag';
        host.appendChild(note);
        return;
    }

    const grid = document.createElement('div');
    grid.className = 'icon-grid';

    labels.forEach((label) => {
        const entries = view[label];

        const group = document.createElement('div');
        group.className = 'stack-group';
        group.dataset.label = label;

        const head = document.createElement('div');
        head.className = 'stack-head';
        const headIcon = document.createElement('span');
        headIcon.className = 'stack-icon';
        headIcon.setAttribute('aria-hidden', 'true');
        headIcon.textContent = itemIcon(label);
        const headName = document.createElement('span');
        headName.className = 'stack-name';
        headName.textContent = label;
        const headCount = document.createElement('span');
        headCount.className = 'stack-count';
        headCount.textContent = `×${entries.length}`;
        head.appendChild(headIcon);
        head.appendChild(headName);
        head.appendChild(headCount);

        const chips = document.createElement('div');
        chips.className = 'stack-chips';
        entries.forEach((entry) => {
            // Empty `{}` entry = a plain unit (nothing to track); tracked
            // entries always carry at least the id handle
            chips.appendChild(
                isTrackedEntry(entry) ? trackedChip(owner, label, entry) : plainChip(owner, label)
            );
        });

        group.appendChild(head);
        group.appendChild(chips);
        grid.appendChild(group);
    });

    host.appendChild(grid);
}

// Chip for a TRACKED unit: draggable, focusable, carries its identity so a
// drop can look the exact record up in the source sidecar.
function trackedChip(owner: Owner, label: string, entry: TrackedEntry): HTMLElement {
    const chip = document.createElement('div');
    chip.className = 'chip tracked';
    chip.draggable = true;
    chip.tabIndex = 0;
    chip.dataset.from = owner.id;
    chip.dataset.kind = 'tracked';
    chip.dataset.instanceId = entry.id;
    chip.dataset.label = label;
    chip.setAttribute('aria-label', `${entry.id} (${label}) — drag to another inventory`);

    const icon = document.createElement('span');
    icon.className = 'chip-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = itemIcon(label);

    const tooltip = document.createElement('span');
    tooltip.className = 'tooltip';
    tooltip.setAttribute('role', 'tooltip');
    // Tooltip = random tracking id · optional display name · stats line —
    // the same `id, name?, stats` order the listing JSON uses.
    tooltip.textContent = [entry.id, entry.name, describeStats(entry.stats)]
        .filter((part) => part !== undefined)
        .join(' · ');

    chip.addEventListener('dragstart', (event) => onDragStart(event, owner, {
        kind: 'tracked',
        id: entry.id,
        label,
    }));

    chip.appendChild(icon);
    chip.appendChild(tooltip);
    return chip;
}

// Chip for a PLAIN unit: draggable count mover — no id/stats exist in the
// package for it, so the tooltip says exactly that.
function plainChip(owner: Owner, label: string): HTMLElement {
    const chip = document.createElement('div');
    chip.className = 'chip plain';
    chip.draggable = true;
    chip.tabIndex = 0;
    chip.dataset.from = owner.id;
    chip.dataset.kind = 'plain';
    chip.dataset.label = label;
    chip.setAttribute('aria-label', `plain ${label} unit — drag to another inventory`);

    const icon = document.createElement('span');
    icon.className = 'chip-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = itemIcon(label);

    const tooltip = document.createElement('span');
    tooltip.className = 'tooltip';
    tooltip.setAttribute('role', 'tooltip');
    tooltip.textContent = `plain ${label} unit — no id, no stats`;

    chip.addEventListener('dragstart', (event) => onDragStart(event, owner, {
        kind: 'plain',
        label,
    }));

    chip.appendChild(icon);
    chip.appendChild(tooltip);
    return chip;
}

// ----------------------------------------------------------------------------
// Drag & drop exchange — a chip dropped on ANOTHER inventory moves that unit
// ----------------------------------------------------------------------------
// The drag payload carries IDENTITY only (from/kind/label/id) — never the
// stats payload: opaque stats may hold values JSON.stringify would mangle,
// so the drop looks the record up in the SOURCE sidecar and moves the exact
// object by reference.

type DragPayload =
    | { from: string; kind: 'tracked'; id: string; label: string }
    | { from: string; kind: 'plain'; label: string };

// dragstart: serialize the identity payload into the transfer
function onDragStart(
    event: DragEvent,
    owner: Owner,
    payload: { kind: 'tracked'; id: string; label: string } | { kind: 'plain'; label: string },
): void {
    // Identity only — stats are fetched from the source sidecar at drop time
    const transfer = JSON.stringify(
        payload.kind === 'tracked'
            ? { from: owner.id, kind: payload.kind, id: payload.id, label: payload.label }
            : { from: owner.id, kind: payload.kind, label: payload.label },
    );
    event.dataTransfer?.setData('text/plain', transfer);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
}

// Strict payload parsing: malformed/foreign transfer data is a silent no-op
// (a drop of garbage must never mutate an inventory).
function readPayload(dataTransfer: DataTransfer | null): DragPayload | null {
    if (!dataTransfer) return null;
    let raw: unknown;
    try {
        raw = JSON.parse(dataTransfer.getData('text/plain'));
    } catch {
        return null;
    }
    const isRecord = (value: unknown): value is Record<string, unknown> =>
        typeof value === 'object' && value !== null;
    const isNonEmptyString = (value: unknown): value is string =>
        typeof value === 'string' && value.length > 0;
    if (!isRecord(raw) || !isNonEmptyString(raw.from) || !isNonEmptyString(raw.label)) {
        return null;
    }
    if (raw.kind === 'plain') {
        return { from: raw.from, kind: 'plain', label: raw.label };
    }
    if (raw.kind === 'tracked' && isNonEmptyString(raw.id)) {
        return { from: raw.from, kind: 'tracked', id: raw.id, label: raw.label };
    }
    return null;
}

// Applies one unit transfer (the drag & drop "exchange"):
//   - tracked chip → removeInstance on the source (record + 1 aggregate unit
//     gone), then addInstance on the target with the SAME id and the SAME
//     stats object reference — identity + payload preserved across owners.
//   - plain chip → counted remove(1) on the source + counted add(1) on the
//     target. The facade consumes PLAIN units first, and a plain chip only
//     exists while plain ≥ 1, so this can never eat a tracked instance.
// Every refusal path returns without touching anything (silent no-op — the
// visuals stay consistent because nothing is re-rendered).
function applyTransfer(payload: DragPayload | null, target: Owner): void {
    if (!payload || payload.from === target.id) return; // garbage or same-inventory drop
    const source = owners.find((candidate) => candidate.id === payload.from);
    if (!source) return;

    if (payload.kind === 'tracked') {
        // Look the record up in the SOURCE sidecar (prototype-safe own-key
        // check) — the payload alone is not trusted.
        if (!hasOwn(source.instances, payload.id)) return;
        const record = source.instances[payload.id];
        if (record.id !== payload.id || record.label !== payload.label) return; // stale payload
        if (!source.controller.removeInstance(payload.id)) return; // vanished mid-drag
        // Same id + SAME stats reference → identity + payload preserved.
        // addInstance returns null only on a live id collision — impossible
        // with the demo's owner-prefixed ids, but fall back to a minted id
        // defensively (payload still preserved).
        const received = target.controller.addInstance(record.label, record.stats, record.id);
        if (received === null) target.controller.addInstance(record.label, record.stats);
        renderAll();
        return;
    }

    // Plain unit: the dragged `{}` icon only exists while plain ≥ 1, so
    // the plain-first consumption order guarantees a plain unit moves.
    if (!source.controller.remove(payload.label, 1)) return; // defensive: stock vanished mid-drag
    target.controller.add(payload.label, 1);
    renderAll();
}

// Wire each panel as a drop target ONCE at boot. dragover MUST preventDefault
// or the browser never fires drop; the highlight class gives the user a
// visible "drop here" affordance.
owners.forEach((owner) => {
    const panel = mustGet(`${owner.id}-panel`);

    panel.addEventListener('dragover', (event) => {
        event.preventDefault();
        panel.classList.add('drop-target');
    });
    panel.addEventListener('dragleave', () => {
        panel.classList.remove('drop-target');
    });
    panel.addEventListener('drop', (event) => {
        event.preventDefault();
        panel.classList.remove('drop-target');
        applyTransfer(readPayload(event.dataTransfer), owner);
    });
});

// ----------------------------------------------------------------------------
// Live JSON views — grouped per-unit view + the wrapped original, per owner
// ----------------------------------------------------------------------------

// Rebuilt on every render like the icon grid. TWO pre blocks per owner:
//   1. the grouped per-unit view above (what the data MEANS — one array
//      entry per unit: tracked identities + stats, plain units as
//      entry per unit: tracked identities + stats, plain units as empty
//      `{}` entries) — the icon grid is built from the
//      very same object,
//   2. the wrapped original bag verbatim (what is STORED — counts only), so
//      the demo never implies the count bag itself is array-shaped.
// Both go through textContent — no innerHTML, no JSON.parse anywhere here.
function renderJson(host: HTMLElement, owner: Owner): void {
    host.replaceChildren();

    const groupLabel = document.createElement('span');
    groupLabel.className = 'json-label';
    // Heading names the shape honestly: every label is an array with ONE
    // entry per unit — tracked records and plain `{}` entries alike; a label
    // value is never a bare number.
    groupLabel.textContent = `inventory JSON — ${owner.label.toLowerCase()} (grouped by item · one entry per unit)`;

    const grouped = document.createElement('pre');
    grouped.className = 'json-view json-grouped';
    const groupedCode = document.createElement('code');
    groupedCode.textContent = JSON.stringify(groupedUnitsView(owner), null, 2);
    grouped.appendChild(groupedCode);

    const rawLabel = document.createElement('span');
    rawLabel.className = 'json-label';
    rawLabel.textContent = `raw bag JSON — wrapped original (counts only)`;

    const raw = document.createElement('pre');
    raw.className = 'json-view json-raw';
    const rawCode = document.createElement('code');
    rawCode.textContent = JSON.stringify(owner.bag, null, 2);
    raw.appendChild(rawCode);

    host.appendChild(groupLabel);
    host.appendChild(grouped);
    host.appendChild(rawLabel);
    host.appendChild(raw);
}

// One render pass after every mutation: icon grids + JSON views per owner.
function renderAll(): void {
    owners.forEach((owner) => {
        renderIcons(mustGet(`${owner.id}-bag`), owner);
        renderJson(mustGet(`${owner.id}-json`), owner);
    });
}

// ----------------------------------------------------------------------------
// Startup
// ----------------------------------------------------------------------------

renderAll();
