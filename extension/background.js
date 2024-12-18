const cookieManager = {
  managedDomains: new Set(),

  init() {
    this.loadManagedDomains();
    this.setupEventListeners();
  },

  loadManagedDomains() {
    chrome.storage.local.get(['managedDomains'], (result) => {
      if (result.managedDomains) {
        this.managedDomains = new Set(result.managedDomains);
      }
    });
  },

  setupEventListeners() {
    // Listener para manejar pestañas cerradas
    chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
      this.handleTabClose(tabId);
    });

    // Listener para limpiar todas las cookies al cerrar Chrome
    chrome.runtime.onSuspend.addListener(() => {
      this.cleanupAllCookies();
    });
  },

  handleTabClose(tabId) {
    // Verifica el dominio asociado a la pestaña cerrada
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError || !tab?.url) return;

      const domain = new URL(tab.url).hostname;
      this.checkAndCleanupDomain(domain);
    });
  },

  checkAndCleanupDomain(domain) {
    // Verifica si el dominio está gestionado
    const matchingDomain = Array.from(this.managedDomains).find((managed) =>
      domain.endsWith(managed.replace(/^\./, ''))
    );

    if (matchingDomain) {
      // Revisa si quedan pestañas abiertas para este dominio
      chrome.tabs.query({ url: `*://*.${matchingDomain}/*` }, (tabs) => {
        if (tabs.length === 0) {
          this.removeCookiesForDomain(matchingDomain);
        }
      });
    }
  },

  removeCookiesForDomain(domain) {
    const cleanDomain = domain.startsWith('.') ? domain.substring(1) : domain;

    chrome.cookies.getAll({ domain: cleanDomain }, (cookies) => {
      cookies.forEach((cookie) => {
        const protocol = cookie.secure ? 'https://' : 'http://';
        const cookieUrl = `${protocol}${cookie.domain}${cookie.path}`;
        chrome.cookies.remove({ url: cookieUrl, name: cookie.name });
      });
    });
  },

  cleanupAllCookies() {
    // Limpia todas las cookies de los dominios gestionados
    this.managedDomains.forEach((domain) => {
      this.removeCookiesForDomain(domain);
    });
    chrome.storage.local.remove('managedDomains');
    this.managedDomains.clear();
  },
};

// Manejador de mensajes para configurar dominios gestionados
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.type) {
    case 'SET_MANAGED_DOMAINS':
      cookieManager.managedDomains = new Set(request.domains);
      chrome.storage.local.set({
        managedDomains: Array.from(cookieManager.managedDomains),
      });
      sendResponse({ success: true });
      return true;

    case 'GET_CURRENT_ACCOUNT':
      chrome.storage.local.get(['currentAccount'], (result) => {
        sendResponse(result.currentAccount);
      });
      return true;
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'TEST_MESSAGE') {
        console.log('Test message received in background.js');
        sendResponse({ success: true, message: 'Message handled!' });
    }
});

// Inicializar el gestor de cookies
cookieManager.init();
