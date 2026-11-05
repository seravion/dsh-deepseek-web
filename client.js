/**
 * dsh-deepseek-web — browser half.
 *
 * Adds one row to the left sidebar's global panel list (the row list that holds
 * Plugins / Automation tasks). The row selects a **global main panel**, exactly
 * as the Plugins page does: the panel fills the centre column, needs no
 * Session, and works with no conversation open at all.
 *
 * The panel hosts the page itself. Desktop renders it in an Electron
 * `<webview>` (the main window enables the tag — the same element the built-in
 * Browser uses), which the page's `X-Frame-Options` cannot refuse. A plain
 * browser renders an `<iframe>`, and a site that refuses framing leaves the
 * toolbar's external-browser action as the way out.
 *
 * Documented surfaces used here:
 *   - `sidebar.panellist` slot, kind `list`  (the row)
 *   - `main` keyed slot                      (the panel the row addresses)
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
      framed: '这个网页拒绝被嵌入显示，请用系统浏览器打开。',
    };
    const en = {
      label: 'DeepSeek Web',
      framed: 'This page refuses to be framed — open it in your browser.',
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

    /** @returns whether this renderer can host an Electron `<webview>`. */
    function hasWebview() {
      try {
        return !(document.createElement('webview') instanceof HTMLUnknownElement);
      } catch {
        return false;
      }
    }

    /** Last-resort opener: a plain browser tab. */
    function openExternal() {
      try {
        window.open(TARGET, '_blank', 'noopener,noreferrer');
      } catch {
        // A blocked popup leaves the panel and its toolbar on screen.
      }
    }

    /**
     * The full-page panel. Fills the centre column; no Session is involved.
     * @returns the panel element tree.
     */
    function DeepSeekPanel() {
      const host = React.useRef(null);
      const [failed, setFailed] = React.useState(false);

      React.useEffect(() => {
        const node = host.current;
        if (node === null) return undefined;
        // Built imperatively: a <webview> must be attached with its attributes
        // already set, or the guest never starts.
        if (hasWebview()) {
          const view = document.createElement('webview');
          view.setAttribute('src', TARGET);
          view.setAttribute('partition', 'persist:dsh-deepseek-web');
          view.setAttribute('allowpopups', 'false');
          view.style.cssText =
            'position:absolute;inset:0;display:flex;width:100%;height:100%;border:0;background:#fff';
          const onFail = event => {
            // -3 is ABORTED, which a redirect fires; only real failures matter.
            if (event && event.errorCode === -3) return;
            setFailed(true);
          };
          view.addEventListener('did-fail-load', onFail);
          node.appendChild(view);
          return () => {
            view.removeEventListener('did-fail-load', onFail);
            view.remove();
          };
        }
        const frame = document.createElement('iframe');
        frame.setAttribute('src', TARGET);
        frame.setAttribute('referrerpolicy', 'no-referrer');
        frame.style.cssText =
          'position:absolute;inset:0;width:100%;height:100%;border:0;background:#fff';
        frame.addEventListener('error', () => setFailed(true));
        node.appendChild(frame);
        return () => {
          frame.remove();
        };
      }, []);

      const buttonStyle = {
        cursor: 'pointer',
        border: '1px solid var(--dsw-alias-border-secondary, rgba(127,127,127,.3))',
        borderRadius: 999,
        padding: '3px 12px',
        background: 'transparent',
        color: 'inherit',
        font: 'inherit',
      };

      return h(
        'div',
        {
          style: {
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            minHeight: 0,
            background: 'var(--dsw-alias-bg-layer-1, #fff)',
            color: 'var(--dsw-alias-label-primary)',
            fontSize: 13,
          },
        },
        h(
          'div',
          {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 12px',
              borderBottom: '1px solid var(--dsw-alias-border-secondary, rgba(127,127,127,.18))',
              flex: 'none',
            },
          },
          h(Glyph, { size: 14 }),
          h('span', { style: { flex: 1, minWidth: 0, opacity: 0.75 } }, 'chat.deepseek.com'),
          h('button', { type: 'button', onClick: openExternal, style: buttonStyle, title: 'chat.deepseek.com' }, '↗'),
        ),
        failed
          ? h(
              'div',
              {
                style: {
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 12,
                  flex: 1,
                  padding: 24,
                  textAlign: 'center',
                },
              },
              h('div', { style: { opacity: 0.7 } }, TARGET),
              h('button', { type: 'button', onClick: openExternal, style: buttonStyle }, '↗ chat.deepseek.com'),
            )
          : h('div', {
              ref: host,
              style: { position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden' },
            }),
      );
    }

    return {
      inject: ['slots', 'layout'],
      /**
       * Register the row and the panel it addresses.
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

        // The panel. Selecting this id is exactly what the row's click does, so
        // nothing has to intercept it: the panel simply stays on screen.
        ctx.slots.inject('main', function* () {
          yield ctx.slots.register({ name: 'main', key: PANEL_ID, locale: NS }, DeepSeekPanel);
        });
      },
    };
  },
});
