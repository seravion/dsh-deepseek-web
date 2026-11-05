/**
 * Smoke test: load the browser half outside Harness and drive clicks.
 *
 * Two paths are asserted:
 *   A. first use — no dedicated Session yet, so one is started and the tab is
 *      opened in whatever Session ends up on screen;
 *   B. later use — the remembered Session still exists, so the click navigates
 *      back to it before asking the Browser for the tab.
 *
 * In both, the previous main panel is restored BEFORE anything touches the
 * right column (its commands throw while a global panel holds the centre), and
 * the panel's display-mode control is clicked last.
 *
 *   node scripts/smoke-test.mjs
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(join(root, 'client.js'), 'utf8');

/** Build a fresh sandbox + fake host for one scenario. */
function run({ stored, sessionIds, activeTab }) {
  let factory;
  const order = [];
  const store = new Map();
  if (stored !== undefined) store.set('dsh-deepseek-web:session', stored);

  const sandbox = {
    window: {
      __ModuleLoader__: {
        load({ id, factory: f }) {
          assert.equal(id, 'dsh-deepseek-web');
          factory = f;
        },
      },
      localStorage: {
        getItem: key => (store.has(key) ? store.get(key) : null),
        setItem: (key, value) => store.set(key, value),
      },
      open: (...args) => order.push(['window.open', ...args]),
      setTimeout: fn => fn(),
    },
    document: {
      createElement: () => ({ style: {}, setAttribute() {}, addEventListener() {} }),
      querySelector: selector =>
        selector === '[data-sidebar-right-mode="fullscreen"]'
          ? { click: () => order.push(['fullscreen']) }
          : null,
    },
    HTMLUnknownElement: class HTMLUnknownElement {},
    console,
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);

  const requireStub = id => {
    if (id !== 'react') throw new Error(`unexpected require(${id})`);
    return { createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }) };
  };
  const plugin = factory(requireStub);

  const registered = [];
  const listeners = new Set();
  let activePanelId = null;
  const rows = [...sessionIds];
  const sessionStore = {
    getSnapshot: () => rows.map(id => ({ id })),
    subscribe: () => () => {},
  };

  const ctx = {
    slots: {
      inject(name, installer) {
        const dispose = installer();
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
    effect: fn => fn(),
    get(name) {
      if (name === 'locale') {
        return { register: () => () => {}, bind: () => key => (key === 'label' ? 'DeepSeek 网页' : key) };
      }
      if (name === 'sessions') return { list: sessionStore };
      if (name === 'uiWorkspace') {
        return {
          startSession: () => order.push(['startSession']),
          openSession: id => order.push(['openSession', id]),
        };
      }
      if (name === 'sidebarRightTabs') return { get: kind => (kind === 'browser' ? {} : undefined) };
      if (name === 'sidebarRight') {
        return {
          openTab: (kind, options) => order.push(['openTab', kind, options.params.url]),
          active: () => activeTab,
        };
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
  return { plugin, order, registered, ctx, store, assert: undefined };
}

const pluginInject = run({ stored: undefined, sessionIds: ['s1'] }).plugin.inject;
assert.deepEqual([...pluginInject], ['slots', 'layout']);

// --- A. first use: no remembered Session ------------------------------------
{
  const { order, registered, ctx } = run({ stored: undefined, sessionIds: ['s1'] });
  const rows = registered.filter(r => r.definition.name === 'sidebar.panellist');
  assert.equal(rows.length, 1, 'exactly one sidebar row');
  assert.equal(rows[0].definition.id, 'deepseek-web');
  assert.equal(rows[0].definition.label(), 'DeepSeek 网页');
  assert.equal(registered.filter(r => r.definition.name === 'main').length, 1);

  ctx.layout.selectPanel('deepseek-web');
  assert.deepEqual(order, [
    ['selectPanel', 'deepseek-web'],
    ['selectPanel', null],
    ['startSession'],
    ['openTab', 'browser', 'https://chat.deepseek.com/'],
    ['fullscreen'],
  ]);
}

// --- B. later use: the remembered Session still exists -----------------------
{
  const { order, ctx, store } = run({ stored: 's9', sessionIds: ['s1', 's9'] });
  ctx.layout.selectPanel('deepseek-web');
  assert.deepEqual(order, [
    ['selectPanel', 'deepseek-web'],
    ['selectPanel', null],
    ['openSession', 's9'],
    ['openTab', 'browser', 'https://chat.deepseek.com/'],
    ['fullscreen'],
  ]);
  assert.equal(store.get('dsh-deepseek-web:session'), 's9', 'the id stays remembered');
}

// --- C. remembered Session was deleted: recreate -----------------------------
{
  const { order, ctx } = run({ stored: 'gone', sessionIds: ['s1'] });
  ctx.layout.selectPanel('deepseek-web');
  assert.deepEqual(order, [
    ['selectPanel', 'deepseek-web'],
    ['selectPanel', null],
    ['startSession'],
    ['openTab', 'browser', 'https://chat.deepseek.com/'],
    ['fullscreen'],
  ], 'a deleted Session is recreated rather than opened');
}

// --- D. clicked again while a Browser page is already showing ---------------
{
  const { order, ctx } = run({ stored: 's9', sessionIds: ['s1', 's9'], activeTab: { kind: 'browser' } });
  ctx.layout.selectPanel('deepseek-web');
  assert.deepEqual(order, [
    ['selectPanel', 'deepseek-web'],
    ['selectPanel', null],
    ['openSession', 's9'],
    ['fullscreen'], // no second Browser page
  ], 're-clicking returns to the page instead of stacking another');
}

console.log('smoke test passed');
