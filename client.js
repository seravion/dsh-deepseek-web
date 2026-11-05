/**
 * dsh-deepseek-web — browser half.
 *
 * Adds one row to the left sidebar's global panel list (the row list that holds
 * Plugins / Automation tasks). Clicking it opens https://chat.deepseek.com/ in
 * the Harness built-in Browser and switches that column to fullscreen, so the
 * page takes the whole window instead of the 45% side track.
 *
 * Why the row cannot just render the page itself: the Desktop main process
 * validates every `<webview>` against a lease it issued (see
 * `will-attach-webview` — no lease means `event.preventDefault()`), and an
 * `<iframe>` is refused by the site's framing policy. The built-in Browser is
 * the only surface a plugin can put a third-party page on, and it is
 * session-scoped: its commands throw while no Session is on screen. Hence the
 * selection hook below — it restores the previous main panel first, so a
 * Session is mounted by the time the Browser is asked for a tab.
 *
 * Documented surfaces used here:
 *   - `sidebar.panellist` slot, kind `list`             (the row)
 *   - `main` keyed slot                                 (the panel the row addresses)
 *   - `ctx.layout.panelInfo` / `selectPanel`            (selection interception)
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

    const zh = {
      label: 'DeepSeek 网页',
      opening: '正在打开 DeepSeek 网页版…',
      external: '这个环境里无法内嵌，已用系统浏览器打开',
    };
    const en = {
      label: 'DeepSeek Web',
      opening: 'Opening DeepSeek Web…',
      external: 'Cannot embed here — opened in your browser instead',
    };

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

    /** Last-resort opener: a plain browser tab. */
    function openExternal() {
      try {
        window.open(TARGET, '_blank', 'noopener,noreferrer');
      } catch {
        // A blocked popup leaves the placeholder panel on screen.
      }
    }

    /**
     * Ask the built-in Browser for a tab.
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
        // No Session on screen, or no Browser in this composition.
        return false;
      }
    }

    /**
     * Move the just-opened panel from the 45% track to fullscreen through the
     * panel's own display-mode control. That control is the documented UI for
     * the action; the service's `toggleFullscreen` wants an internal pane target
     * a plugin never holds, so the control itself is driven.
     *
     * The tab mounts asynchronously, so poll briefly. The attribute names the
     * action the button would perform: `fullscreen` means "expand next", so an
     * already-fullscreen panel is left alone.
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
        if (++tries > 40) return; // ~2s, then leave the panel as it is
        window.setTimeout(tick, 50);
      };
      tick();
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

        // The launcher. Order matters: restoring the previous panel FIRST puts a
        // Session back on screen, because the Browser's commands throw while a
        // global panel holds the main column.
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
            if (!openInBrowser(ctx)) {
              openExternal();
              return;
            }
            expandToFullscreen();
          });
          return () => unsubscribe();
        }, 'deepseek-web: launcher');
      },
    };
  },
});
