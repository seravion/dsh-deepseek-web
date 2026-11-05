/**
 * dsh-deepseek-web — browser half.
 *
 * Adds one row to the left sidebar's global panel list (the row list that holds
 * Plugins / Automation tasks). Clicking it puts chat.deepseek.com on screen in
 * the Harness built-in Browser, fullscreen, inside **one dedicated Session** —
 * so the page keeps running while the user works in other Sessions, and the
 * next click jumps straight back to it.
 *
 * Why a dedicated Session: the right column is per-Session (its store is keyed
 * by session id), so a tab opened in the Session on screen disappears from view
 * the moment another Session is selected. One fixed Session gives the page a
 * stable home. The id is remembered in localStorage; if the Session is deleted,
 * the next click creates a fresh one.
 *
 * Why the row cannot render the page itself: the Desktop main process validates
 * every `<webview>` against a lease it issued (`will-attach-webview` →
 * `event.preventDefault()` without one), and an `<iframe>` is refused by the
 * site's framing policy. The built-in Browser is the only surface a plugin can
 * put a third-party page on.
 *
 * Documented surfaces used here:
 *   - `sidebar.panellist` slot, kind `list`             (the row)
 *   - `main` keyed slot                                 (the panel the row addresses)
 *   - `ctx.layout.panelInfo` / `selectPanel`            (selection interception)
 *   - `ctx.uiWorkspace.openSession` / `startSession`    (the dedicated Session)
 *   - `ctx.sessions.list`                               (does it still exist?)
 *   - `ctx.sidebarRight.openTab('browser', { params })` (the built-in Browser)
 */
window.__ModuleLoader__.load({
  id: 'dsh-deepseek-web',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /** Dictionary namespace owned by this plugin. */
    const NS = 'deepseek-web';
    /** Panel id shared by the sidebar row and the main panel it addresses. */
    const PANEL_ID = 'deepseek-web';
    /** The page the row opens. */
    const TARGET = 'https://chat.deepseek.com/';
    /** localStorage key holding the dedicated Session id. */
    const STORE_KEY = 'dsh-deepseek-web:session';

    const zh = { label: 'DeepSeek 网页' };
    const en = { label: 'DeepSeek Web' };

    /**
     * The row glyph: a globe, drawn at the edge the sidebar asks for.
     * @param props - the sidebar's icon share.
     * @returns decorative globe.
     */
    function Glyph({ size = 18 }) {
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 20 20',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.5,
          strokeLinecap: 'round',
          'aria-hidden': 'true',
          style: { display: 'block' },
        },
        h('circle', { cx: 10, cy: 10, r: 7.1 }),
        h('ellipse', { cx: 10, cy: 10, rx: 3.1, ry: 7.1 }),
        h('path', { d: 'M3.1 7.5h13.8M3.1 12.5h13.8' }),
      );
    }

    // --- dedicated Session ---------------------------------------------------

    /** @returns the remembered Session id, or null. */
    function readStored() {
      try {
        return window.localStorage.getItem(STORE_KEY);
      } catch {
        return null;
      }
    }

    /** @param id - Session id to remember. */
    function writeStored(id) {
      try {
        window.localStorage.setItem(STORE_KEY, id);
      } catch {
        // Storage may be denied; the Session is then found again only by luck.
      }
    }

    /**
     * The client's Session list store, when this composition serves one.
     * @param ctx - client root context.
     * @returns the store, or undefined.
     */
    function sessionList(ctx) {
      try {
        const service = ctx.get('sessions');
        const list = service?.list ?? service;
        if (list !== undefined && typeof list.getSnapshot === 'function') return list;
      } catch {
        // No Session service here.
      }
      return undefined;
    }

    /** @returns every known Session id. */
    function sessionIds(list) {
      try {
        const snapshot = list.getSnapshot();
        const rows = Array.isArray(snapshot)
          ? snapshot
          : snapshot?.sessions ?? snapshot?.items ?? snapshot?.list ?? [];
        return rows.map(row => row?.id).filter(id => typeof id === 'string');
      } catch {
        return [];
      }
    }

    /**
     * Resolve the dedicated Session, creating it on first use.
     *
     * Calls back with its id, or with `undefined` when this composition cannot
     * create one — the caller then simply uses the Session on screen.
     * @param ctx - client root context.
     * @param done - receives the id, or undefined.
     */
    function ensureDedicated(ctx, done) {
      const list = sessionList(ctx);
      const stored = readStored();
      if (stored !== null && (list === undefined || sessionIds(list).includes(stored))) {
        done(stored);
        return;
      }
      const workspace = ctx.get('uiWorkspace');
      if (workspace === undefined || typeof workspace.startSession !== 'function' || list === undefined) {
        done(undefined);
        return;
      }
      const before = new Set(sessionIds(list));
      let settled = false;
      let unsubscribe;
      const finish = id => {
        if (settled) return;
        settled = true;
        try {
          unsubscribe?.();
        } catch {
          // The store may already be gone.
        }
        if (id !== undefined) writeStored(id);
        done(id);
      };
      try {
        unsubscribe = list.subscribe?.(() => {
          const fresh = sessionIds(list).find(id => !before.has(id));
          if (fresh !== undefined) finish(fresh);
        });
      } catch {
        // Without a subscription the new id cannot be identified; fall back.
      }
      try {
        workspace.startSession();
      } catch {
        finish(undefined);
        return;
      }
      // Never leave the click hanging if the new Session is not identifiable.
      window.setTimeout(() => finish(undefined), 2500);
    }

    // --- the browser ---------------------------------------------------------

    /** Last-resort opener: a plain browser tab. */
    function openExternal() {
      try {
        window.open(TARGET, '_blank', 'noopener,noreferrer');
      } catch {
        // A blocked popup leaves the placeholder panel on screen.
      }
    }

    /**
     * Ask the built-in Browser for a tab in the Session on screen.
     * @param ctx - client root context.
     * @returns whether the Browser took the URL.
     */
    function openInBrowser(ctx) {
      try {
        const tabs = ctx.get('sidebarRightTabs');
        if (tabs === undefined || tabs.get('browser') === undefined) return false;
        const right = ctx.get('sidebarRight');
        if (right === undefined || typeof right.openTab !== 'function') return false;
        right.openTab('browser', { params: { url: TARGET } });
        return true;
      } catch {
        // No Session on screen yet, or no Browser in this composition.
        return false;
      }
    }

    /**
     * Move the opened panel from the 45% track to fullscreen through the panel's
     * own display-mode control. That control is the documented UI for the
     * action; the service's `toggleFullscreen` wants an internal pane target a
     * plugin never holds, so the control itself is driven.
     *
     * The attribute names the action the button would perform: `fullscreen`
     * means "expand next", so an already-fullscreen panel is left alone.
     */
    function expandToFullscreen() {
      const selector = '[data-sidebar-right-mode="fullscreen"]';
      let tries = 0;
      const tick = () => {
        const control = document.querySelector(selector);
        if (control !== null) {
          control.click();
          return;
        }
        if (++tries > 60) return; // ~3s, then leave the panel as it is
        window.setTimeout(tick, 50);
      };
      tick();
    }

    /**
     * Jump to the dedicated Session and make sure its Browser tab is up.
     * @param ctx - client root context.
     */
    function launch(ctx) {
      ensureDedicated(ctx, id => {
        if (id !== undefined) {
          try {
            ctx.get('uiWorkspace').openSession(id);
          } catch {
            // Navigation refused; the tab still opens in the Session on screen.
          }
        }
        // The navigation and the column's mount are asynchronous: retry briefly
        // rather than open the tab before a Session is on screen (that throws).
        let attempts = 0;
        const tryOpen = () => {
          if (openInBrowser(ctx)) {
            expandToFullscreen();
            return;
          }
          if (++attempts < 20) {
            window.setTimeout(tryOpen, 100);
            return;
          }
          openExternal();
        };
        window.setTimeout(tryOpen, id === undefined ? 0 : 200);
      });
    }

    /** Shown only if the selection hook ever misses; keeps the row self-explanatory. */
    function Placeholder() {
      return h(
        'div',
        {
          style: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            minHeight: 200,
            color: 'var(--dsw-alias-label-secondary)',
            fontSize: 14,
          },
        },
        TARGET,
      );
    }

    return {
      inject: ['slots', 'layout'],
      /**
       * Register the row, the panel it addresses, and the selection hook.
       * @param ctx - client root context.
       */
      apply(ctx) {
        /** English fallback until (and unless) the dictionary binds. */
        let translate = key => (key === 'label' ? 'DeepSeek Web' : key);
        // `get` rather than `ctx.locale`: a missing service must cost the
        // dictionary, not the whole plugin (an uninjected property throws).
        try {
          const locale = ctx.get('locale');
          if (locale !== undefined && typeof locale.register === 'function') {
            const dispose = locale.register(NS, { zh, en });
            ctx.effect(() => dispose, 'deepseek-web: dictionary');
            translate = locale.bind(NS);
          }
        } catch {
          // No locale service in this composition: keep the English fallback.
        }

        // The row, in the same list as Plugins and Automation tasks.
        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            {
              name: 'sidebar.panellist',
              id: PANEL_ID,
              order: 10,
              label: () => translate('label'),
              locale: NS,
            },
            Glyph,
          ),
        );

        // A row addresses a main panel, so one must exist for the id — the
        // sidebar's selectPanel(id) throws otherwise and the click does nothing.
        ctx.slots.inject('main', function* () {
          yield ctx.slots.register({ name: 'main', key: PANEL_ID, locale: NS }, Placeholder);
        });

        // The launcher. Restoring the previous panel FIRST keeps a Session on
        // screen, because the Browser's commands throw while a global panel
        // holds the main column.
        ctx.effect(() => {
          const read = () => ctx.layout.panelInfo.getSnapshot().activePanelId;
          let previous = read();
          const restore = id => {
            try {
              ctx.layout.selectPanel(id);
            } catch {
              try {
                ctx.layout.selectPanel(null);
              } catch {
                // Both targets are gone; the placeholder panel stays reachable.
              }
            }
          };
          const unsubscribe = ctx.layout.panelInfo.subscribe(() => {
            const active = read();
            if (active !== PANEL_ID) {
              previous = active;
              return;
            }
            restore(previous);
            launch(ctx);
          });
          return () => unsubscribe();
        }, 'deepseek-web: launcher');
      },
    };
  },
});
