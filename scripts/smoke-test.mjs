/**
 * Smoke test: load the browser half outside Harness and drive one click.
 *
 * The module talks to six surfaces (module loader, slots, locale, layout,
 * sidebarRight, sidebarRightTabs) plus one DOM control; this file fakes exactly
 * those and asserts the click path:
 *   1. the previous main panel is restored FIRST (the Browser's commands need a
 *      Session on screen),
 *   2. then the Browser tab is opened with the DeepSeek URL,
 *   3. then the panel's display-mode control is clicked to go fullscreen.
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

const order = [];
const fullscreenSelector = '[data-sidebar-right-mode="fullscreen"]';
const sandbox = {
  window: {
    __ModuleLoader__: {
      load({ id, factory: f }) {
        assert.equal(id, 'dsh-deepseek-web');
        factory = f;
      },
    },
    open: (...args) => order.push(['window.open', ...args]),
    setTimeout: fn => fn(),
  },
  document: {
    createElement: () => ({ style: {}, setAttribute() {}, addEventListener() {} }),
    querySelector: selector =>
      selector === fullscreenSelector ? { click: () => order.push(['fullscreen']) } : null,
  },
  HTMLUnknownElement: class HTMLUnknownElement {},
  console,
};
vm.createContext(sandbox);

const source = await readFile(join(root, 'client.js'), 'utf8');
vm.runInContext(source, sandbox);
assert.equal(typeof factory, 'function', 'client.js must call __ModuleLoader__.load');

const plugin = factory(requireStub);
// Spread first: values from the vm realm have that realm's Array.prototype.
assert.deepEqual([...plugin.inject], ['slots', 'layout']);

// --- harness doubles -------------------------------------------------------
const registered = [];
const listeners = new Set();
let activePanelId = null;
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
  effect(fn) {
    return fn();
  },
  get(name) {
    if (name === 'locale') return ctxLocale;
    if (name === 'sidebarRightTabs') return { get: kind => (kind === 'browser' ? {} : undefined) };
    if (name === 'sidebarRight') {
      return { openTab: (kind, options) => order.push(['openTab', kind, options.params.url]) };
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
      order.push(['selectPanel', id]);
      activePanelId = id;
      listeners.forEach(fn => fn());
    },
  },
};

plugin.apply(ctx);

// --- registration shape ----------------------------------------------------
const rows = registered.filter(r => r.definition.name === 'sidebar.panellist');
assert.equal(rows.length, 1, 'exactly one sidebar row');
assert.equal(rows[0].definition.id, 'deepseek-web');
assert.equal(rows[0].definition.order, 10);
assert.equal(rows[0].definition.label(), 'DeepSeek 网页', 'label follows the bound dictionary');

const panels = registered.filter(r => r.definition.name === 'main');
assert.equal(panels.length, 1, 'the addressed main panel is registered');
assert.equal(panels[0].definition.key, 'deepseek-web', 'same id as the row');

// --- the click -------------------------------------------------------------
// The sidebar's own onClick for a panel row: select, then notify.
ctx.layout.selectPanel('deepseek-web');

assert.deepEqual(order, [
  ['selectPanel', 'deepseek-web'],
  ['selectPanel', null], // previous panel restored first
  ['openTab', 'browser', 'https://chat.deepseek.com/'],
  ['fullscreen'], // the panel's own display-mode control
]);

// A second click from inside a global panel restores THAT panel.
ctx.layout.selectPanel('plugins');
order.length = 0;
ctx.layout.selectPanel('deepseek-web');
assert.deepEqual(order, [
  ['selectPanel', 'deepseek-web'],
  ['selectPanel', 'plugins'],
  ['openTab', 'browser', 'https://chat.deepseek.com/'],
  ['fullscreen'],
]);

console.log('smoke test passed');
