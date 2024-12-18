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
    // Solo escuchar el cierre de pestañas
    chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
      await this.handleTabClose(tabId);
    });

    // Limpiar al cerrar el navegador
    chrome.runtime.onSuspend.addListener(() => {
      this.cleanupAllCookies();
    });
  },

  async handleTabClose(tabId) {
    try {
      // Obtener todas las pestañas antes del cierre
      const tabs = await chrome.tabs.query({});
      
      // Verificar cada dominio gestionado
      for (const domain of this.managedDomains) {
        const cleanDomain = domain.replace(/^\./, '');
        
        // Buscar si quedan pestañas abiertas con este dominio
        const hasOpenTabs = tabs.some(tab => {
          try {
            if (!tab.url) return false;
            const tabDomain = new URL(tab.url).hostname;
            return tabDomain === cleanDomain || tabDomain.endsWith('.' + cleanDomain);
          } catch {
            return false;
          }
        });

        // Si no quedan pestañas con este dominio, eliminar sus cookies
        if (!hasOpenTabs) {
          await this.removeCookiesForDomain(domain);
        }
      }
    } catch (error) {
      console.error('Error handling tab close:', error);
    }
  },

  async removeCookiesForDomain(domain) {
    const cleanDomain = domain.startsWith('.') ? domain.substring(1) : domain;

    try {
      const cookies = await chrome.cookies.getAll({ domain: cleanDomain });
      
      for (const cookie of cookies) {
        const protocol = cookie.secure ? 'https://' : 'http://';
        const cookieUrl = `${protocol}${cookie.domain}${cookie.path}`;
        
        try {
          await chrome.cookies.remove({
            url: cookieUrl,
            name: cookie.name,
            storeId: cookie.storeId
          });
        } catch (error) {
          console.error(`Error removing cookie ${cookie.name}:`, error);
        }
      }
    } catch (error) {
      console.error(`Error removing cookies for domain ${domain}:`, error);
    }
  },

  async cleanupAllCookies() {
    try {
      const domains = Array.from(this.managedDomains);
      for (const domain of domains) {
        await this.removeCookiesForDomain(domain);
      }
      await chrome.storage.local.remove('managedDomains');
      this.managedDomains.clear();
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }
};

// Manejador de mensajes
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'SET_MANAGED_DOMAINS') {
    cookieManager.managedDomains = new Set(request.domains);
    chrome.storage.local.set({
      managedDomains: Array.from(cookieManager.managedDomains),
    });
    console.log('Managed domains updated:', cookieManager.managedDomains);
    sendResponse({ success: true });
    return true;
  }
});

// Inicializar el gestor de cookies
cookieManager.init();