/**
 * dsh-deepseek-web — browser half.
 *
 * Adds one row to the left sidebar's global panel list (the row list that holds
 * Plugins / Automation tasks). A panel row addresses a main panel, so the click
 * cannot be re-bound: instead this module registers the main panel for its id
 * and intercepts the selection. The click therefore opens
 * https://chat.deepseek.com/ in the built-in Browser (right sidebar) and hands
 * the centre column straight back to whatever it was showing.
 *
 * Everything here runs against documented client surfaces:
 *   - `sidebar.panellist`          slot, kind `list`   (the row itself)
 *   - `main`                       keyed slot          (the panel the row addresses)
 *   - `ctx.layout.panelInfo` / `selectPanel`           (selection interception)
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
      title: '打开 DeepSeek 网页版',
      fallback: '在右侧栏打开失败，点这里用浏览器打开',
    };
    const en = {
      label: 'DeepSeek Web',
      title: 'Open DeepSeek Web',
      fallback: 'The right sidebar did not take it — open it in a browser',
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

    /**
     * Open the target page in the built-in Browser when that tab type is served.
     * @param ctx - client root context.
     * @returns whether a Browser tab took the URL.
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
        // No Browser in this composition: the caller falls back to a new tab.
        return false;
      }
    }

    /** Last-resort opener: a plain browser tab. */
    function openExternal() {
      try {
        window.open(TARGET, '_blank', 'noopener,noreferrer');
      } catch {
        // A blocked popup leaves the panel's own button on screen.
      }
    }

    /**
     * Stand-in for the main panel the row addresses. The selection is normally
     * intercepted before this ever paints; when it is not, the user still gets
     * one button that opens the page.
     */
    function LauncherPanel() {
      return h(
        'div',
        {
          style: {
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            height: '100%',
            minHeight: 220,
            padding: 24,
            color: 'var(--dsw-alias-label-primary)',
            fontSize: 14,
          },
        },
        h(Glyph, { size: 32 }),
        h(
          'button',
          {
            type: 'button',
            onClick: openExternal,
            style: {
              cursor: 'pointer',
              border: '1px solid var(--dsw-alias-border-secondary, rgba(127,127,127,.3))',
              borderRadius: 999,
              padding: '8px 18px',
              background: 'var(--dsw-alias-interactive-bg-hover, transparent)',
              color: 'inherit',
              font: 'inherit',
            },
          },
          'chat.deepseek.com',
        ),
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

        // A row addresses a main panel, so one must exist for the id — otherwise
        // the sidebar's selectPanel(id) throws and nothing happens at all.
        ctx.slots.inject('main', function* () {
          yield ctx.slots.register({ name: 'main', key: PANEL_ID }, LauncherPanel);
        });

        // The launcher itself: watch the selection, open the page, hand the
        // centre column back. Restoring inside the notification means React
        // never paints the stand-in panel, and the Conversation is not remounted.
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
                // Both targets are gone; the stand-in panel stays reachable.
              }
            }
          };
          const unsubscribe = ctx.layout.panelInfo.subscribe(() => {
            const active = read();
            if (active !== PANEL_ID) {
              previous = active;
              return;
            }
            const opened = openInBrowser(ctx);
            restore(previous);
            if (!opened) openExternal();
          });
          return () => unsubscribe();
        }, 'deepseek-web: launcher');
      },
    };
  },
});
