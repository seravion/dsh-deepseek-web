/**
 * Smoke test: load the browser half outside Harness and inspect what it mounts.
 *
 * The client module talks to four surfaces (module loader, slots, locale,
 * layout); this file fakes exactly those and asserts the shipped shape: one
 * sidebar row, one main panel under the same id, and no selection
 * interception — the row's own click selects the panel.
 *
 *   node scripts/smoke-test.mjs
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// --- module loader ---------------------------------------------------------
let factory;
const requireStub = id => {
  if (id !== 'react') throw new Error(`unexpected require(${id})`);
  return { createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }) };
};
const sandbox = {
  window: {
    __ModuleLoader__: {
      load({ id, factory: f }) {
        assert.equal(id, 'dsh-deepseek-web');
        factory = f;
      },
    },
    open: (...args) => sandbox.opened.push(args),
  },
  document: {
    createElement: () => ({ style: {}, setAttribute() {}, addEventListener() {} }),
  },
  HTMLUnknownElement: class HTMLUnknownElement {},
  console,
};
sandbox.opened = [];
vm.createContext(sandbox);

const source = await readFile(join(root, 'client.js'), 'utf8');
vm.runInContext(source, sandbox);
assert.equal(typeof factory, 'function', 'client.js must call __ModuleLoader__.load');

const plugin = factory(requireStub);
// Spread first: values from the vm realm have that realm's Array.prototype.
assert.deepEqual([...plugin.inject], ['slots', 'layout']);

// --- harness doubles -------------------------------------------------------
const registered = [];
const effects = [];
const touchedLayout = [];
const ctxLocale = {
  register: () => () => {},
  bind: () => key => (key === 'label' ? 'DeepSeek 网页' : key),
};

const ctx = {
  slots: {
    inject(name, installer) {
      const dispose = installer();
      // A generator installer runs to its first yield, like the host's.
      if (dispose && typeof dispose.next === 'function') {
        const first = dispose.next();
        return () => first.value?.();
      }
      return dispose;
    },
    register(definition, component) {
      registered.push({ definition, component });
      return () => {};
    },
  },
  effect(fn, label) {
    effects.push(label);
    return fn();
  },
  get(name) {
    if (name === 'locale') return ctxLocale;
    return undefined;
  },
  layout: {
    panelInfo: { getSnapshot: () => ({ activePanelId: null }), subscribe: () => () => {} },
    selectPanel(id) {
      touchedLayout.push(id);
    },
  },
};

plugin.apply(ctx);

// --- assertions ------------------------------------------------------------
const rows = registered.filter(r => r.definition.name === 'sidebar.panellist');
assert.equal(rows.length, 1, 'exactly one sidebar row');
assert.equal(rows[0].definition.id, 'deepseek-web');
assert.equal(rows[0].definition.order, 10);
assert.equal(rows[0].definition.label(), 'DeepSeek 网页', 'label follows the bound dictionary');
assert.equal(typeof rows[0].component, 'function');

const panels = registered.filter(r => r.definition.name === 'main');
assert.equal(panels.length, 1, 'the addressed main panel is registered');
assert.equal(panels[0].definition.key, 'deepseek-web', 'same id as the row');
assert.equal(typeof panels[0].component, 'function', 'the panel renders a component, not null');

assert.deepEqual(touchedLayout, [], 'no selection interception: the row click selects the panel');
assert.equal(sandbox.opened.length, 0, 'nothing opens a browser tab on mount');

console.log('smoke test passed');
