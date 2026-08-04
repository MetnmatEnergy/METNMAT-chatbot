(function () {
    const SCRIPT_ID = 'chat-widget-script';
    const CONTAINER_ID = 'chat-widget-container';
    const IFRAME_ID = 'chat-widget-iframe';
    // Config - Dynamic based on script location or fixed to agent server
    // Assuming script is served from same origin as iframe for this setup
    // Or user can configure. For now, let's derive from script src or hardcode to origin.

    // If we serve widget.js from http://server.com/widget.js, we expect iframe at http://server.com/chat-widget/
    const SCRIPT_SRC = document.currentScript?.src;
    const ORIGIN = SCRIPT_SRC ? new URL(SCRIPT_SRC).origin : 'http://localhost:3001';
    const IFRAME_URL = `${ORIGIN}/chat-widget/`;

    // ── Look & feel (brand red, matches the Metnmat site) ──────────────────────
    const BTN_GRADIENT = 'linear-gradient(135deg, hsl(357 74% 52%), hsl(357 74% 42%))';
    const BTN_GRADIENT_HOVER = 'linear-gradient(135deg, hsl(357 74% 56%), hsl(357 74% 46%))';
    const BTN_SHADOW = '0 12px 28px -8px hsla(357, 74%, 42%, 0.55)';

    // Closed state: a friendly chatbot robot — rounded head with a screen face
    // (eyes + smile), an antenna, and side "ears".
    const ICON_ROBOT = `<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M12 2.6v2.3"/><circle cx="12" cy="2" r="1.1" fill="currentColor" stroke="none"/><rect x="4.3" y="5" width="15.4" height="13" rx="3.7"/><path d="M4.3 9.7H2.6a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h1.7"/><path d="M19.7 9.7h1.7a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-1.7"/><circle cx="9.4" cy="11" r="1.15" fill="currentColor" stroke="none"/><circle cx="14.6" cy="11" r="1.15" fill="currentColor" stroke="none"/><path d="M9.5 14.2a3.1 3.1 0 0 0 5 0"/></svg>`;

    // Open state: close (X)
    const ICON_CLOSE = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M18 6 6 18M6 6l12 12"/></svg>`;

    // Read the host site's dark/light theme so the chat panel can match it.
    // Metnmat's site sets a 'dark'/'light' class on <html> (default dark) + mm-theme.
    function getSiteTheme() {
        try {
            const el = document.documentElement;
            if (el.classList.contains('light')) return 'light';
            if (el.classList.contains('dark')) return 'dark';
            return localStorage.getItem('mm-theme') === 'light' ? 'light' : 'dark';
        } catch (e) {
            return 'light';
        }
    }

    function init() {
        // 1. Read Site Key
        const script = document.currentScript || document.querySelector(`script[data-site-key]`);
        if (!script) {
            console.error('Chat Widget: script tag not found or missing data-site-key');
            return;
        }
        const siteKey = script.getAttribute('data-site-key');
        if (!siteKey) {
            console.error('Chat Widget: data-site-key attribute is required');
            return;
        }

        // 2. Inject Button & Iframe
        if (document.getElementById(CONTAINER_ID)) return; // Already injected

        const container = document.createElement('div');
        container.id = CONTAINER_ID;
        container.style.position = 'fixed';
        container.style.bottom = '20px';
        container.style.right = '20px';
        container.style.zIndex = '999999';
        container.style.fontFamily = 'sans-serif';

        // Button
        const button = document.createElement('button');
        button.setAttribute('aria-label', 'Chat with a Metnmat specialist');
        button.innerHTML = ICON_ROBOT;
        button.style.width = '62px';
        button.style.height = '62px';
        button.style.borderRadius = '50%';
        button.style.background = BTN_GRADIENT;
        button.style.color = '#fff';
        button.style.border = 'none';
        button.style.cursor = 'pointer';
        button.style.boxShadow = BTN_SHADOW;
        button.style.display = 'flex';
        button.style.alignItems = 'center';
        button.style.justifyContent = 'center';
        button.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
        button.onclick = toggleChat;

        button.onmouseover = () => {
            button.style.transform = 'scale(1.06) translateY(-2px)';
            button.style.background = BTN_GRADIENT_HOVER;
        };
        button.onmouseout = () => {
            button.style.transform = 'scale(1) translateY(0)';
            button.style.background = BTN_GRADIENT;
        };

        // Iframe Container (Hidden by default)
        const iframeContainer = document.createElement('div');
        iframeContainer.id = 'chat-widget-frame-container';
        iframeContainer.style.display = 'none';
        iframeContainer.style.position = 'absolute';
        iframeContainer.style.bottom = '80px';
        iframeContainer.style.right = '0';
        iframeContainer.style.width = '380px';
        iframeContainer.style.height = '600px';
        iframeContainer.style.maxHeight = 'calc(100vh - 120px)';
        iframeContainer.style.maxWidth = 'calc(100vw - 40px)';
        iframeContainer.style.backgroundColor = '#fff';
        iframeContainer.style.borderRadius = '24px';
        iframeContainer.style.boxShadow = '0 25px 50px -12px rgba(0, 0, 0, 0.25)';
        iframeContainer.style.overflow = 'hidden';
        iframeContainer.style.opacity = '0';
        iframeContainer.style.transform = 'translateY(20px) scale(0.95)';
        iframeContainer.style.transition = 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
        iframeContainer.style.pointerEvents = 'none';
        iframeContainer.style.border = '1px solid rgba(0, 0, 0, 0.05)';

        const iframe = document.createElement('iframe');
        iframe.src = IFRAME_URL;
        iframe.id = IFRAME_ID;
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.style.border = 'none';
        iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox');

        iframeContainer.appendChild(iframe);
        container.appendChild(iframeContainer);
        container.appendChild(button);

        // "Online" status dot over the button — signals a specialist is available.
        const statusDot = document.createElement('span');
        statusDot.style.cssText = 'position:absolute;right:5px;bottom:50px;width:14px;height:14px;border-radius:50%;background:#16a34a;border:2.5px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.25);pointer-events:none;';
        container.appendChild(statusDot);

        document.body.appendChild(container);

        // State
        let isOpen = false;

        function toggleChat() {
            isOpen = !isOpen;

            if (isOpen) {
                iframeContainer.style.display = 'block';
                // Trigger animation after setting display block
                setTimeout(() => {
                    iframeContainer.style.opacity = '1';
                    iframeContainer.style.transform = 'translateY(0) scale(1)';
                    iframeContainer.style.pointerEvents = 'all';
                }, 10);

                button.innerHTML = ICON_CLOSE;

                // Send INIT message (with current theme)
                iframe.contentWindow.postMessage({
                    type: 'INIT_WIDGET',
                    siteKey: siteKey,
                    theme: getSiteTheme()
                }, ORIGIN);
            } else {
                iframeContainer.style.opacity = '0';
                iframeContainer.style.transform = 'translateY(20px) scale(0.95)';
                iframeContainer.style.pointerEvents = 'none';

                button.innerHTML = ICON_ROBOT;

                setTimeout(() => {
                    if (!isOpen) iframeContainer.style.display = 'none';
                }, 400); // Wait for transition
            }
        }

        // Listen for messages from the iframe
        window.addEventListener('message', (event) => {
            // ORIGIN GATE — do not remove.
            //
            // This listener runs on the HOST site and acts on what it receives:
            // NAVIGATE calls window.location.assign() with the supplied URL, and
            // ADD_TO_CART dispatches into the site's cart. postMessage reaches
            // window.parent from ANY embedded cross-origin frame, and the site
            // embeds third-party frames (the footer map), so without this check a
            // forced-redirect / phishing primitive was available to all of them.
            //
            // ORIGIN is the chat host, derived from this script's own src at the
            // top of this file. The source check additionally pins the sender to
            // OUR iframe rather than any same-origin frame.
            if (event.origin !== ORIGIN) return;
            if (!iframe.contentWindow || event.source !== iframe.contentWindow) return;
            if (!event.data) return;
            if (event.data.type === 'CLOSE_WIDGET') {
                if (isOpen) toggleChat();
            }
            // The chat UI announces when it has mounted — (re)send the site key + theme so
            // it can create its session and match the site, regardless of load order.
            if (event.data.type === 'WIDGET_READY') {
                iframe.contentWindow.postMessage({ type: 'INIT_WIDGET', siteKey: siteKey, theme: getSiteTheme() }, ORIGIN);
            }
            // Customer tapped "Add to cart" in chat → hand the SKU to the host site's
            // shop (ChatCartBridge listens for this event and updates the cart), then
            // the site answers with 'metnmat:cart-result' which we forward to the chat.
            if (event.data.type === 'ADD_TO_CART' && typeof event.data.sku === 'string') {
                try {
                    window.dispatchEvent(new CustomEvent('metnmat:add-to-cart', {
                        detail: { sku: event.data.sku, qty: event.data.qty }
                    }));
                } catch (e) {
                    iframe.contentWindow.postMessage({ type: 'CART_RESULT', ok: false, error: 'cart unavailable here' }, ORIGIN);
                }
            }
            // Customer tapped a link in chat → ALWAYS change the current page in the SAME
            // tab (never open a new tab). The chat re-appears and its history persists on
            // the next page. tel:/mailto: trigger the dialer/mail app instead of navigating.
            if (event.data.type === 'NAVIGATE' && typeof event.data.url === 'string') {
                const url = event.data.url;
                if (/^(tel:|mailto:)/i.test(url)) {
                    window.location.href = url;
                    return;
                }
                try {
                    const dest = new URL(url, window.location.href);
                    // SCHEME ALLOW-LIST. `new URL('javascript:alert(1)')` parses
                    // happily, its hostname is empty so it misses SITE_HOSTS, and
                    // the old else-branch handed it to location.assign — script
                    // execution in the host page's own origin. Only real network
                    // schemes may navigate; tel:/mailto: were already handled.
                    if (dest.protocol !== 'https:' && dest.protocol !== 'http:') return;

                    // The bot links to the canonical metnmat.com domain. Rewrite those to the
                    // CURRENT host so navigation works on localhost AND production (same tab).
                    const SITE_HOSTS = ['metnmat.com', 'www.metnmat.com'];
                    if (SITE_HOSTS.indexOf(dest.hostname) !== -1) {
                        window.location.assign(window.location.origin + dest.pathname + dest.search + dest.hash);
                    } else {
                        window.location.assign(dest.href);
                    }
                } catch (e) {
                    // Unparseable input is dropped. The old fallback passed the raw
                    // string straight to location.assign, which re-opened exactly
                    // the hole the allow-list above closes.
                }
            }
        });

        // Site cart confirms (or rejects) a chat-initiated add → relay into the chat.
        window.addEventListener('metnmat:cart-result', (event) => {
            const d = (event && event.detail) || {};
            iframe.contentWindow.postMessage({ type: 'CART_RESULT', ok: !!d.ok, name: d.name, sku: d.sku, error: d.error }, ORIGIN);
        });

        // Keep the chat panel in sync with the host site's dark/light theme.
        iframeContainer.style.backgroundColor = getSiteTheme() === 'dark' ? '#16181d' : '#fff';
        try {
            const themeObserver = new MutationObserver(() => {
                const theme = getSiteTheme();
                iframeContainer.style.backgroundColor = theme === 'dark' ? '#16181d' : '#fff';
                if (iframe.contentWindow) {
                    iframe.contentWindow.postMessage({ type: 'THEME_CHANGE', theme: theme }, ORIGIN);
                }
            });
            themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        } catch (e) { /* MutationObserver unavailable — theme still set on open */ }
    }

    // Auto init
    if (document.readyState === 'complete') {
        init();
    } else {
        window.addEventListener('load', init);
    }
})();
