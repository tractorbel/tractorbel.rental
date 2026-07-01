(() => {
  const CONTENT_ID = 'page-content';
  const CACHE = new Map();
  const EXECUTED_SCRIPTS = new Set();
  let currentPage = null;
  let initialized = false;

  function normalizePath(pathname) {
    const clean = pathname.split('?')[0].split('#')[0];
    return clean === '' ? '/index.html' : clean;
  }

  function getPageNameFromUrl(url) {
    const parsed = new URL(url, window.location.href);
    const path = parsed.pathname.split('/').pop();
    return path || 'index.html';
  }

  function getContentRoot() {
    return document.getElementById(CONTENT_ID) || document.getElementById('app-content') || document.getElementById('conteudo') || document.body;
  }

  function shouldUseDirectNavigation() {
    return window.location.protocol === 'file:' || window.location.origin === 'null' || window.location.hostname !== 'localhost';
  }

  function setActiveLink(pageName) {
    const target = pageName || 'index.html';
    document.querySelectorAll('nav a[href], .navbar a[href]').forEach((link) => {
      const href = link.getAttribute('href') || '';
      const normalizedHref = href.split('?')[0].split('#')[0];
      const isMatch = normalizedHref === target || normalizedHref === `/${target}` || normalizedHref === `./${target}`;
      link.classList.toggle('active', isMatch);
      if (isMatch) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    });
  }

  function isAppNavigationLink(link) {
    if (!link || link.hasAttribute('download') || link.target === '_blank') return false;
    const href = link.getAttribute('href') || '';
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return false;
    const url = new URL(href, window.location.href);
    return url.origin === window.location.origin && /\.html$/i.test(url.pathname);
  }

  function extractPageContent(html, baseUrl) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const root = doc.getElementById(CONTENT_ID) || doc.getElementById('app-content') || doc.getElementById('conteudo');

    if (!root) {
      throw new Error('Conteúdo da página não encontrado.');
    }

    const scripts = Array.from(doc.querySelectorAll('script')).filter((script) => {
      const src = (script.getAttribute('src') || '').toLowerCase();
      return !src.includes('app-router.js');
    });

    const styles = Array.from(doc.querySelectorAll('link[rel="stylesheet"]'));
    const inlineStyles = Array.from(doc.querySelectorAll('style'));

    return {
      content: root.innerHTML,
      scripts,
      styles,
      inlineStyles,
      baseUrl: baseUrl || window.location.href
    };
  }

  const INJECTED_STYLES = new Set();

  function injectContentAndScripts(contentHtml, scripts, styles, inlineStyles, baseUrl) {
    const root = getContentRoot();
    if (!root) return;

    root.innerHTML = contentHtml;
    // Inject linked styles into head if not already present
    (styles || []).forEach((linkEl) => {
      const href = linkEl.getAttribute('href');
      if (!href) return;
      const resolved = new URL(href, baseUrl || window.location.href).href;
      if (INJECTED_STYLES.has(resolved)) return;
      INJECTED_STYLES.add(resolved);
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = resolved;
      document.head.appendChild(link);
    });

    // Inject inline styles from the page head
    (inlineStyles || []).forEach((styleEl) => {
      const key = styleEl.textContent;
      if (!key || INJECTED_STYLES.has(key)) return;
      INJECTED_STYLES.add(key);
      const style = document.createElement('style');
      style.textContent = key;
      document.head.appendChild(style);
    });

    scripts.forEach((scriptSource) => {
      const src = scriptSource.getAttribute('src');
      const text = scriptSource.textContent || '';
      const key = src || text;
      if (!key || EXECUTED_SCRIPTS.has(key)) return;

      // If this is an inline script, detect top-level declarations and skip
      // if any of the declared identifiers already exist in the global scope.
      if (!src && text) {
        const declared = [];
        const declRegex = /(?:^|[;\n\r\s])(let|const|var|function)\s+([A-Za-z_$][0-9A-Za-z_$]*)/g;
        let m;
        while ((m = declRegex.exec(text))) {
          if (m[2]) declared.push(m[2]);
        }
        const already = declared.some((name) => typeof window[name] !== 'undefined');
        if (already) {
          // mark as executed to avoid retrying
          try { EXECUTED_SCRIPTS.add(key); } catch (e) {}
          return;
        }
      }

      const script = document.createElement('script');
      if (src) {
        script.src = new URL(src, baseUrl || window.location.href).href;
      } else {
        script.textContent = text;
      }
      if (scriptSource.type) {
        script.type = scriptSource.type;
      }
      try {
        document.body.appendChild(script);
        EXECUTED_SCRIPTS.add(key);
      } catch (err) {
        console.warn('Script injection failed, skipping:', err && err.message);
        try { EXECUTED_SCRIPTS.add(key); } catch (e) {}
      }
    });
  }

  function renderPage(pageName, html, options = {}) {
    const base = options.baseUrl || new URL(pageName, window.location.href).href;
    const { content, scripts, styles, inlineStyles, baseUrl } = extractPageContent(html, base);
    injectContentAndScripts(content, scripts, styles, inlineStyles, baseUrl);
    currentPage = pageName;
    setActiveLink(pageName);

    if (options.pushState !== false) {
      const full = new URL(pageName === 'index.html' ? './' : pageName, base);
      const pushPath = full.pathname + (full.search || '') + (full.hash || '');
      history.pushState({ page: pageName }, '', pushPath);
    }
  }

  function loadPage(targetUrl, options = {}) {
    const pageName = getPageNameFromUrl(targetUrl);
    const cacheKey = pageName;

    if (pageName === currentPage) {
      setActiveLink(pageName);
      return Promise.resolve();
    }

    if (CACHE.has(cacheKey)) {
      const cached = CACHE.get(cacheKey);
      injectContentAndScripts(cached.content, cached.scripts, cached.styles, cached.inlineStyles, cached.baseUrl);
      currentPage = pageName;
      setActiveLink(pageName);
      if (options.pushState !== false) {
        const base = new URL(pageName, window.location.href).href;
        const full = new URL(pageName === 'index.html' ? './' : pageName, base);
        const pushPath = full.pathname + (full.search || '') + (full.hash || '');
        history.pushState({ page: pageName }, '', pushPath);
      }
      return Promise.resolve();
    }

    return fetch(targetUrl, { credentials: 'same-origin' })
      .then((response) => {
        if (!response.ok) throw new Error(`Falha ao carregar ${targetUrl}`);
        return response.text();
      })
      .then((html) => {
        const base = new URL(targetUrl, window.location.href).href;
        const parsed = extractPageContent(html, base);
        CACHE.set(cacheKey, parsed);
        renderPage(pageName, html, Object.assign({}, options, { baseUrl: base }));
      })
      .catch((error) => {
        console.error(error);
      });
  }

  document.addEventListener('click', (event) => {
    const link = event.target.closest('a');
    if (!link || !isAppNavigationLink(link)) return;

    if (shouldUseDirectNavigation()) {
      return;
    }

    const href = link.getAttribute('href');
    if (!href) return;

    event.preventDefault();

    const targetPage = getPageNameFromUrl(href);
    if (targetPage === currentPage) {
      setActiveLink(targetPage);
      return;
    }

    loadPage(href);
  });

  window.addEventListener('popstate', () => {
    const targetPage = normalizePath(window.location.pathname);
    const pageName = targetPage === '/' ? 'index.html' : targetPage.split('/').pop();
    if (pageName && pageName !== currentPage) {
      const cached = CACHE.get(pageName);
      if (cached) {
        injectContentAndScripts(cached.content, cached.scripts, cached.styles, cached.inlineStyles, cached.baseUrl);
        currentPage = pageName;
        setActiveLink(pageName);
      } else {
        loadPage(pageName, { pushState: false });
      }
    }
  });

  function init() {
    if (initialized) return;
    initialized = true;
    currentPage = getPageNameFromUrl(window.location.href);
    setActiveLink(currentPage);
    // Ensure nav clicks close mobile menu so a single click triggers action
    try {
      document.querySelectorAll('nav a').forEach((link) => {
        link.addEventListener('click', () => {
          const menu = document.getElementById('menu');
          if (menu && menu.classList.contains('active')) menu.classList.remove('active');
        });
      });
    } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
