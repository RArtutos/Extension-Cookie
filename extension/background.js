const cookieManager = {
  managedDomains: new Set(),
  sessionCheckInterval: null,
  API_URL: 'https://api.artutos.us.kg',

  init() {
    this.loadManagedDomains();
    this.setupEventListeners();
    this.startSessionCheck();
  },

  loadManagedDomains() {
    chrome.storage.local.get(['managedDomains'], (result) => {
      if (result.managedDomains) {
        this.managedDomains = new Set(result.managedDomains);
      }
    });
  },

  setupEventListeners() {
    // Escuchar cierre de pestañas
    chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
      await this.handleTabClose(tabId);
    });

    // Limpiar al cerrar el navegador
    chrome.runtime.onSuspend.addListener(() => {
      this.cleanupAllCookies();
    });

    // Escuchar cambios en el almacenamiento
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (changes.currentAccount) {
        this.handleAccountChange(changes.currentAccount.newValue, changes.currentAccount.oldValue);
      }
    });
  },

  async handleAccountChange(newAccount, oldAccount) {
    if (oldAccount) {
      await this.removeCookiesForAccount(oldAccount);
    }
    if (newAccount) {
      await this.setAccountCookies(newAccount);
    }
  },

  startSessionCheck() {
    // Verificar el estado de la sesión cada 30 segundos
    this.sessionCheckInterval = setInterval(async () => {
      await this.checkSessionStatus();
    }, 30000);
  },

  async checkSessionStatus() {
    try {
      const currentAccount = await this.getCurrentAccount();
      if (!currentAccount) return;

      const token = await this.getToken();
      if (!token) return;

      const response = await fetch(`${this.API_URL}/api/accounts/${currentAccount.id}/session`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        // Si hay un error 401 o la sesión no es válida, limpiar cookies
        if (response.status === 401 || response.status === 403) {
          await this.cleanupCurrentSession();
        }
        return;
      }

      const sessionData = await response.json();
      if (!sessionData.active || sessionData.status === 'cancelled') {
        await this.cleanupCurrentSession();
      }
    } catch (error) {
      console.error('Error checking session status:', error);
    }
  },

  async getCurrentAccount() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['currentAccount'], (result) => {
        resolve(result.currentAccount);
      });
    });
  },

  async getToken() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['token'], (result) => {
        resolve(result.token);
      });
    });
  },

  async handleTabClose(tabId) {
    try {
      const tabs = await chrome.tabs.query({});
      
      for (const domain of this.managedDomains) {
        const cleanDomain = domain.replace(/^\./, '');
        
        const hasOpenTabs = tabs.some(tab => {
          try {
            if (!tab.url) return false;
            const tabDomain = new URL(tab.url).hostname;
            return tabDomain === cleanDomain || tabDomain.endsWith('.' + cleanDomain);
          } catch {
            return false;
          }
        });

        if (!hasOpenTabs) {
          await this.removeCookiesForDomain(domain);
        }
      }
    } catch (error) {
      console.error('Error handling tab close:', error);
    }
  },

  async removeCookiesForAccount(account) {
    if (!account?.cookies?.length) return;
    
    for (const cookie of account.cookies) {
      await this.removeCookiesForDomain(cookie.domain);
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

  async setAccountCookies(account) {
    if (!account?.cookies?.length) return;

    try {
      const domains = [];
      
      for (const cookie of account.cookies) {
        const domain = cookie.domain;
        domains.push(domain);
        
        await this.removeCookiesForDomain(domain);

        if (cookie.name === 'header_cookies') {
          await this.setHeaderCookies(domain, cookie.value);
        } else {
          await this.setCookie(domain, cookie.name, cookie.value);
        }
      }

      this.managedDomains = new Set(domains);
      await chrome.storage.local.set({ managedDomains: Array.from(this.managedDomains) });
    } catch (error) {
      console.error('Error setting account cookies:', error);
    }
  },

  async setCookie(domain, name, value) {
    const cleanDomain = domain.startsWith('.') ? domain.substring(1) : domain;
    const url = `https://${cleanDomain}`;
    
    try {
      await chrome.cookies.set({
        url,
        name,
        value,
        domain,
        path: '/',
        secure: true,
        sameSite: 'lax'
      });
    } catch (error) {
      console.warn(`Error setting cookie ${name}, retrying with alternative settings:`, error);
      try {
        await chrome.cookies.set({
          url,
          name,
          value,
          domain: cleanDomain,
          path: '/',
          secure: false,
          sameSite: 'no_restriction'
        });
      } catch (retryError) {
        console.error(`Failed to set cookie ${name} after retry:`, retryError);
      }
    }
  },

  async setHeaderCookies(domain, cookieString) {
    if (!cookieString) return;
    
    const cookies = this.parseHeaderString(cookieString);
    for (const cookie of cookies) {
      await this.setCookie(domain, cookie.name, cookie.value);
    }
  },

  parseHeaderString(cookieString) {
    if (!cookieString) return [];
    
    const cookies = [];
    const pairs = cookieString.split(';');
    
    for (const pair of pairs) {
      const [name, value] = pair.trim().split('=');
      if (name && value) {
        cookies.push({ name: name.trim(), value: value.trim() });
      }
    }
    
    return cookies;
  },

  async cleanupCurrentSession() {
    try {
      const currentAccount = await this.getCurrentAccount();
      if (currentAccount) {
        await this.removeCookiesForAccount(currentAccount);
      }
      
      await chrome.storage.local.remove(['currentAccount', 'managedDomains']);
      this.managedDomains.clear();

      // Notificar al popup que la sesión ha expirado
      chrome.runtime.sendMessage({ type: 'SESSION_EXPIRED' });
    } catch (error) {
      console.error('Error during session cleanup:', error);
    }
  },

  async cleanupAllCookies() {
    try {
      const domains = Array.from(this.managedDomains);
      for (const domain of domains) {
        await this.removeCookiesForDomain(domain);
      }
      await chrome.storage.local.remove(['managedDomains', 'currentAccount']);
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
    sendResponse({ success: true });
    return true;
  }
});

// Inicializar el gestor de cookies
cookieManager.init();