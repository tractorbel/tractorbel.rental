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
    return window.location.protocol === 'file:' || window.location.origin === 'null';
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

  function extractPageContent(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const root = doc.getElementById(CONTENT_ID) || doc.getElementById('app-content') || doc.getElementById('conteudo');

    if (!root) {
      throw new Error('Conteúdo da página não encontrado.');
    }

    return {
      content: root.innerHTML,
      scripts: Array.from(doc.querySelectorAll('script')).filter((script) => {
        const src = (script.getAttribute('src') || '').toLowerCase();
        return !src.includes('app-router.js');
      })
    };
  }

  function injectContentAndScripts(contentHtml, scripts) {
    const root = getContentRoot();
    if (!root) return;

    root.innerHTML = contentHtml;

    scripts.forEach((scriptSource) => {
      const src = scriptSource.getAttribute('src');
      const key = src || scriptSource.textContent;
      if (!key || EXECUTED_SCRIPTS.has(key)) return;

      EXECUTED_SCRIPTS.add(key);
      const script = document.createElement('script');
      if (src) {
        script.src = src;
      } else {
        script.textContent = scriptSource.textContent;
      }
      if (scriptSource.type) {
        script.type = scriptSource.type;
      }
      document.body.appendChild(script);
    });
  }

  function renderPage(pageName, html, options = {}) {
    const { content, scripts } = extractPageContent(html);
    injectContentAndScripts(content, scripts);
    currentPage = pageName;
    setActiveLink(pageName);

    if (options.pushState !== false) {
      const targetUrl = pageName === 'index.html' ? '/' : `/${pageName}`;
      history.pushState({ page: pageName }, '', targetUrl);
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
      injectContentAndScripts(cached.content, cached.scripts);
      currentPage = pageName;
      setActiveLink(pageName);
      if (options.pushState !== false) {
        const targetPath = pageName === 'index.html' ? '/' : `/${pageName}`;
        history.pushState({ page: pageName }, '', targetPath);
      }
      return Promise.resolve();
    }

    return fetch(targetUrl, { credentials: 'same-origin' })
      .then((response) => {
        if (!response.ok) throw new Error(`Falha ao carregar ${targetUrl}`);
        return response.text();
      })
      .then((html) => {
        const parsed = extractPageContent(html);
        CACHE.set(cacheKey, parsed);
        renderPage(pageName, html, options);
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
        injectContentAndScripts(cached.content, cached.scripts);
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
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
