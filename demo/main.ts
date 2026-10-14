// ============================================================================
// demo/main.ts — bootstrap: two wrapped bags → forms → live tables
// ============================================================================
// The demo consumes ONLY the public barrel API via a RELATIVE import
// ('../index', so demo:build never depends on a prior library build — same
// rule as the combat demo): createUserInventory + the Inventory type.
//
// The facade deliberately exposes NO read methods: createUserInventory
// closes over the ORIGINAL object and every add/remove mutates it in place.
// The demo leans into that design — the bag tables below read the raw
// objects directly, showing "the caller's object IS the inventory".
//
// The Exchange panel composes a two-way trade from the public primitives.
// The package's fully-atomic inventoryExchange primitive is internal
// (src/inventory.ts), so the demo does the honest equivalent: it PRE-CHECKS
// affordability on both raw bags, and only when both sides can pay does it
// run remove/add on the controllers. A refused trade logs why and leaves
// both bags untouched.
//
// A11y baseline (combat demo rules): real <button>s, visible focus,
// prefers-reduced-motion respected (styles.css), all dynamic text rendered
// via textContent — no innerHTML anywhere in this demo.
// ----------------------------------------------------------------------------

import { createUserInventory } from '../index';
import type { Inventory } from '../index';

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

// ----------------------------------------------------------------------------
// State — two plain objects wrapped by the public facade
// ----------------------------------------------------------------------------

const heroBag: Inventory = { berries: 3, shells: 2 };
const merchantBag: Inventory = { rope: 4, lantern: 1 };

const hero = createUserInventory(heroBag);
const merchant = createUserInventory(merchantBag);

interface Owner {
    label: string;
    controller: ReturnType<typeof createUserInventory>;
    bag: Inventory;
}

const owners: ReadonlyArray<{ id: 'hero' | 'merchant' } & Owner> = [
    { id: 'hero', label: 'Hero', controller: hero, bag: heroBag },
    { id: 'merchant', label: 'Merchant', controller: merchant, bag: merchantBag }
];

// Raw-bag read (no facade read API by design): item id → count, 0 when absent.
const countOf = (bag: Inventory, item: string): number => bag[item] ?? 0;

const totalOf = (bag: Inventory): number =>
    Object.values(bag).reduce((sum, count) => sum + count, 0);

// ----------------------------------------------------------------------------
// Log panel — newest entry first, aria-live=polite announces each op
// ----------------------------------------------------------------------------

const logHost = mustGet('log');

function log(message: string, kind: 'ok' | 'refused' = 'ok'): void {
    const entry = document.createElement('div');
    entry.className = `log-line ${kind}`;
    entry.textContent = message;
    logHost.prepend(entry); // newest on top; always visible without scrolling
}

// ----------------------------------------------------------------------------
// Bag tables — one per owner, re-rendered after every mutation
// ----------------------------------------------------------------------------

function renderBag(host: HTMLElement, owner: Owner): void {
    host.replaceChildren();

    const table = document.createElement('table');
    table.className = 'bag';
    const body = document.createElement('tbody');

    const stacks = Object.entries(owner.bag).filter(([, count]) => count > 0);
    if (stacks.length === 0) {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.className = 'empty';
        cell.textContent = 'empty bag';
        row.appendChild(cell);
        body.appendChild(row);
    }
    stacks.forEach(([item, count]) => {
        const row = document.createElement('tr');
        const itemCell = document.createElement('td');
        itemCell.textContent = item;
        const countCell = document.createElement('td');
        countCell.className = 'count';
        countCell.textContent = `×${count}`;
        row.appendChild(itemCell);
        row.appendChild(countCell);
        body.appendChild(row);
    });

    const totalRow = document.createElement('tr');
    const totalCell = document.createElement('td');
    totalCell.colSpan = 2;
    totalCell.className = 'total';
    totalCell.textContent = `total units: ${totalOf(owner.bag)}`;
    totalRow.appendChild(totalCell);
    body.appendChild(totalRow);

    table.appendChild(body);
    host.appendChild(table);
}

function renderBags(): void {
    owners.forEach((owner) => {
        renderBag(mustGet(`${owner.id}-bag`), owner);
    });
}

// ----------------------------------------------------------------------------
// Forms — add / remove per owner
// ----------------------------------------------------------------------------

// One labeled input row; helper keeps the three form builders identical.
function inputRow(
    labelText: string,
    itemPlaceholder: string,
    buttonText: string,
    onSubmit: (item: string, count: number) => void
): HTMLElement {
    const row = document.createElement('div');
    row.className = 'form-row';

    const item = document.createElement('input');
    item.type = 'text';
    item.placeholder = itemPlaceholder;
    item.setAttribute('aria-label', `${labelText} item`);
    const count = document.createElement('input');
    count.type = 'number';
    count.min = '1';
    count.step = '1';
    count.value = '1';
    count.setAttribute('aria-label', `${labelText} count`);

    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = buttonText;
    button.addEventListener('click', () => {
        const name = item.value.trim();
        const parsed = Number(count.value);
        if (name === '') {
            log('item name required', 'refused');
            return;
        }
        if (!Number.isInteger(parsed) || parsed < 1) {
            log(`count for ${name} must be an integer ≥ 1`, 'refused');
            return;
        }
        onSubmit(name, parsed);
    });

    row.appendChild(item);
    row.appendChild(count);
    row.appendChild(button);
    return row;
}

owners.forEach((owner) => {
    const forms = mustGet(`${owner.id}-forms`);

    const addRow = inputRow(`${owner.label} add`, 'item…', 'Add', (item, count) => {
        owner.controller.add(item, count); // mutates the ORIGINAL bag in place
        renderBags();
        log(`${owner.label} add ${item} ×${count} — ok (${owner.label.toLowerCase()} bag: ${item} ×${countOf(owner.bag, item)})`);
    });

    const removeRow = inputRow(`${owner.label} remove`, 'item…', 'Remove', (item, count) => {
        // Atomic refusal: remove() returns false and the bag is UNTOUCHED —
        // never a partial removal.
        const removed = owner.controller.remove(item, count);
        renderBags();
        if (removed) {
            log(`${owner.label} remove ${item} ×${count} — ok`);
        } else {
            log(`${owner.label} remove ${item} ×${count} — refused (holds ${countOf(owner.bag, item)}, bag unchanged)`, 'refused');
        }
    });

    forms.appendChild(addRow);
    forms.appendChild(removeRow);
});

// ----------------------------------------------------------------------------
// Exchange — two-way trade composed from the PUBLIC add/remove primitives
// ----------------------------------------------------------------------------
// The package's atomic inventoryExchange is internal, so the demo composes:
// pre-check both raw bags (pure reads), then remove from both, then add
// across. On any refusal NOTHING runs — both bags stay exactly as they were.

function exchangeForm(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'exchange';

    const heroSide = inputRow('Hero gives', 'offer…', 'Trade', () => undefined);
    const merchantSide = inputRow('Merchant gives', 'request…', 'Trade', () => undefined);
    // The two inputRows above are display-only legs of ONE form; their
    // buttons are removed after construction (submit happens once, below).
    heroSide.querySelector('button')?.remove();
    merchantSide.querySelector('button')?.remove();

    const trade = document.createElement('button');
    trade.type = 'button';
    trade.textContent = 'Trade';
    trade.addEventListener('click', () => {
        const inputs = wrap.querySelectorAll<HTMLInputElement>('input');
        const [offerItemEl, offerCountEl, requestItemEl, requestCountEl] = inputs;
        const offerItem = offerItemEl.value.trim();
        const requestItem = requestItemEl.value.trim();
        const offerCount = Number(offerCountEl.value);
        const requestCount = Number(requestCountEl.value);

        if (offerItem === '' || requestItem === '') {
            log('exchange needs an offer AND a request item', 'refused');
            return;
        }
        if (!Number.isInteger(offerCount) || offerCount < 1 || !Number.isInteger(requestCount) || requestCount < 1) {
            log('exchange counts must be integers ≥ 1', 'refused');
            return;
        }

        // Pure pre-checks over the raw bags (public read surface is the
        // original objects themselves).
        if (countOf(heroBag, offerItem) < offerCount) {
            log(`exchange refused — hero holds ${countOf(heroBag, offerItem)} ×${offerItem} (needs ${offerCount}), bags unchanged`, 'refused');
            return;
        }
        if (countOf(merchantBag, requestItem) < requestCount) {
            log(`exchange refused — merchant holds ${countOf(merchantBag, requestItem)} ×${requestItem} (needs ${requestCount}), bags unchanged`, 'refused');
            return;
        }

        // Both sides can pay: perform the swap on the controllers.
        hero.remove(offerItem, offerCount); // proven affordable above
        merchant.remove(requestItem, requestCount); // proven affordable above
        merchant.add(offerItem, offerCount);
        hero.add(requestItem, requestCount);
        renderBags();
        log(`exchange ok — hero −${offerItem} ×${offerCount} +${requestItem} ×${requestCount}; merchant +${offerItem} ×${offerCount} −${requestItem} ×${requestCount}`);
    });

    const caption = document.createElement('p');
    caption.className = 'exchange-caption';
    caption.textContent = 'hero gives … in exchange for … from the merchant (pre-checked against both raw bags; refused trades leave both bags untouched).';

    wrap.appendChild(heroSide);
    wrap.appendChild(merchantSide);
    wrap.appendChild(trade);
    wrap.appendChild(caption);
    return wrap;
}

mustGet('exchange-mount').appendChild(exchangeForm());

// ----------------------------------------------------------------------------
// Startup
// ----------------------------------------------------------------------------

renderBags();
log(`demo started — hero: ${Object.entries(heroBag).map(([item, count]) => `${item} ×${count}`).join(', ') || 'empty'}; merchant: ${Object.entries(merchantBag).map(([item, count]) => `${item} ×${count}`).join(', ') || 'empty'}`);
