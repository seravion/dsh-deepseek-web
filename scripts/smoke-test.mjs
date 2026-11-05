/**
 * Smoke test: load the browser half outside Harness and drive one click.
 *
 * The client module talks to six surfaces (module loader, slots, locale,
 * layout, sidebarRight, sidebarRightTabs); this file fakes exactly those and
 * asserts the click path: Browser tab opened with the DeepSeek URL, centre
 * column handed back, conversation never unmounted.
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
  return {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
  };
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
const slots = new Map(); // slot name -> registration
const calls = { openTab: [], selectPanel: [], effects: [] };
const listeners = new Set();
let activePanelId = null;

const ctxLocale = {
  register: () => () => {},
  bind: () => key => (key === 'label' ? 'DeepSeek 网页' : key),
};

const ctx = {
  slots: {
    inject(name, installer) {
      const install = () => {
        const dispose = installer();
        if (dispose && typeof dispose.next === 'function') {
          // generator installer: run to its first yield
          const first = dispose.next();
          return () => first.value?.();
        }
        return dispose;
      };
      slots.set(name, install());
    },
    register(definition, component) {
      calls[`register:${definition.name}`] = (calls[`register:${definition.name}`] ?? []).concat(definition);
      return () => {};
    },
  },
  locale: ctxLocale,
  effect(fn, label) {
    calls.effects.push(label);
    return fn();
  },
  get(name) {
    if (name === 'locale') return ctxLocale;
    if (name === 'sidebarRightTabs') return { get: kind => (kind === 'browser' ? {} : undefined) };
    if (name === 'sidebarRight') {
      return { openTab: (kind, options) => calls.openTab.push([kind, options]) };
    }
    return undefined;
  },
  layout: {
    panelInfo: {
      getSnapshot: () => ({ activePanelId }),
      subscribe(fn) {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
    },
    selectPanel(id) {
      calls.selectPanel.push(id);
      activePanelId = id;
      if (id !== null && !slots.has('main')) {
        throw new Error(`layout.selectPanel: main panel "${id}" is not registered`);
      }
      listeners.forEach(fn => fn());
    },
  },
};

plugin.apply(ctx);

// --- the click -------------------------------------------------------------
const rows = calls['register:sidebar.panellist'] ?? [];
assert.equal(rows.length, 1, 'exactly one sidebar row');
assert.equal(rows[0].id, 'deepseek-web');
assert.equal(rows[0].label(), 'DeepSeek 网页', 'label follows the bound dictionary');
assert.equal(rows[0].order, 10);

const panels = calls['register:main'] ?? [];
assert.equal(panels.length, 1, 'the addressed main panel is registered');
assert.equal(panels[0].key, 'deepseek-web');

// The sidebar's own onClick for a panel row, in order: select, then notify.
ctx.layout.selectPanel('deepseek-web');

assert.equal(calls.openTab.length, 1, 'one Browser tab opened');
assert.equal(calls.openTab[0][0], 'browser');
assert.equal(calls.openTab[0][1].params.url, 'https://chat.deepseek.com/');
assert.deepEqual(calls.selectPanel, ['deepseek-web', null], 'centre handed back to the Conversation');
assert.equal(sandbox.opened.length, 0, 'no external tab when the Browser takes it');

// Second click from another panel restores that panel, not the Conversation.
ctx.layout.selectPanel('plugins');
calls.openTab.length = 0;
ctx.layout.selectPanel('deepseek-web');
assert.deepEqual(calls.selectPanel.slice(-2), ['deepseek-web', 'plugins']);

console.log('smoke test passed');
