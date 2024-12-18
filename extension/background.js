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
    chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
      await this.handleTabClose(tabId, removeInfo);
    });

    // Múltiples listeners para asegurar la limpieza al cerrar
    chrome.runtime.onSuspend.addListener(() => {
      this.cleanupAllCookies();
    });

    chrome.windows.onRemoved.addListener((windowId) => {
      chrome.windows.getAll((windows) => {
        if (windows.length === 0) {
          this.cleanupAllCookies();
        }
      });
    });

    // Listener adicional para cambios de estado de ventana
    chrome.windows.onFocusChanged.addListener((windowId) => {
      if (windowId === chrome.windows.WINDOW_ID_NONE) {
        this.cleanupAllCookies();
      }
    });
  },

  async handleTabClose(tabId, removeInfo) {
    try {
      // Obtener todas las pestañas antes del cierre
      const allTabs = await chrome.tabs.query({});
      
      // Buscar la pestaña que se está cerrando en el historial reciente
      const closedTab = allTabs.find(tab => tab.id === tabId);
      
      if (closedTab?.url) {
        const domain = new URL(closedTab.url).hostname;
        await this.checkAndCleanupDomain(domain);
      }
    } catch (error) {
      console.log('Error handling tab close:', error);
    }
  },

  async checkAndCleanupDomain(domain) {
    if (!domain) return;

    // Encuentra el dominio gestionado que coincide
    const matchingDomain = Array.from(this.managedDomains).find(managed => {
      const cleanManaged = managed.replace(/^\./, '');
      return domain === cleanManaged || domain.endsWith('.' + cleanManaged);
    });

    if (matchingDomain) {
      try {
        // Busca pestañas abiertas con el mismo dominio
        const tabs = await chrome.tabs.query({});
        const hasOpenTabs = tabs.some(tab => {
          try {
            const tabDomain = new URL(tab.url).hostname;
            return tabDomain === domain || tabDomain.endsWith('.' + matchingDomain.replace(/^\./, ''));
          } catch {
            return false;
          }
        });

        if (!hasOpenTabs) {
          await this.removeCookiesForDomain(matchingDomain);
          console.log(`Cookies removed for domain: ${matchingDomain}`);
        }
      } catch (error) {
        console.error('Error checking domain:', error);
      }
    }
  },

  async removeCookiesForDomain(domain) {
    const cleanDomain = domain.startsWith('.') ? domain.substring(1) : domain;

    try {
      // Obtener todas las cookies del dominio
      const cookies = await chrome.cookies.getAll({ domain: cleanDomain });
      
      // Eliminar cada cookie
      for (const cookie of cookies) {
        const protocol = cookie.secure ? 'https://' : 'http://';
        const cookieUrl = `${protocol}${cookie.domain}${cookie.path}`;
        
        try {
          await chrome.cookies.remove({
            url: cookieUrl,
            name: cookie.name,
            storeId: cookie.storeId
          });
          console.log(`Removed cookie: ${cookie.name} from ${cookieUrl}`);
        } catch (error) {
          console.error(`Error removing cookie ${cookie.name}:`, error);
        }
      }
    } catch (error) {
      console.error(`Error removing cookies for domain ${domain}:`, error);
    }
  },

  async cleanupAllCookies() {
    console.log('Cleaning up all cookies...');
    try {
      const domains = Array.from(this.managedDomains);
      for (const domain of domains) {
        await this.removeCookiesForDomain(domain);
      }
      await chrome.storage.local.remove('managedDomains');
      this.managedDomains.clear();
      console.log('All cookies cleaned successfully');
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }
};

// Manejador de mensajes
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.type) {
    case 'SET_MANAGED_DOMAINS':
      cookieManager.managedDomains = new Set(request.domains);
      chrome.storage.local.set({
        managedDomains: Array.from(cookieManager.managedDomains),
      });
      console.log('Managed domains updated:', cookieManager.managedDomains);
      sendResponse({ success: true });
      return true;

    case 'GET_CURRENT_ACCOUNT':
      chrome.storage.local.get(['currentAccount'], (result) => {
        sendResponse(result.currentAccount);
      });
      return true;
  }
});

// Inicializar el gestor de cookies
cookieManager.init();