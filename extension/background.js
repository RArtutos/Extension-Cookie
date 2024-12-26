import { API_URL } from './js/config.js';

const cookieManager = {
  managedDomains: new Set(),

  init() {
    console.log('Initializing cookieManager');
    this.loadManagedDomains();
    this.setupEventListeners();
    this.startTokenValidation();
  },

  async startTokenValidation() {
    // Validar token cada minuto
    setInterval(async () => {
      try {
        const token = await this.getToken();
        if (!token) return;

        const response = await fetch(`${API_URL}/api/auth/validate`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (!response.ok) {
          console.log('Token validation failed, cleaning up...');
          await this.cleanupAllCookies();
          await this.clearStorage();
        }
      } catch (error) {
        console.error('Error validating token:', error);
        await this.cleanupAllCookies();
        await this.clearStorage();
      }
    }, 60000); // Cada minuto
  },

  async loadManagedDomains() {
    console.log('Loading managed domains');
    const result = await chrome.storage.local.get(['managedDomains']);
    if (result.managedDomains) {
      this.managedDomains = new Set(result.managedDomains);
    }
    console.log('Managed domains loaded:', this.managedDomains);
  },

  setupEventListeners() {
    console.log('Setting up event listeners');
    
    chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
      console.log('Tab closed:', tabId);
      await this.handleTabClose(tabId);
    });

    chrome.runtime.onSuspend.addListener(() => {
      console.log('Browser closing');
      this.cleanupAllCookies();
    });

    chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
      if (request.type === 'CLEANUP_COOKIES') {
        await this.cleanupAllCookies();
        sendResponse({ success: true });
      }
      if (request.type === 'SET_MANAGED_DOMAINS') {
        const newDomains = request.domains || [];
        newDomains.forEach(domain => this.managedDomains.add(domain));
        await chrome.storage.local.set({
          managedDomains: Array.from(this.managedDomains),
        });
        sendResponse({ success: true });
      }
      return true;
    });

    chrome.storage.onChanged.addListener((changes, namespace) => {
      console.log('Storage changed:', changes);
      if (changes.currentAccount) {
        this.handleAccountChange(changes.currentAccount.newValue, changes.currentAccount.oldValue);
      }
      if (changes.managedDomains) {
        const existingDomains = Array.from(this.managedDomains);
        const newDomains = changes.managedDomains.newValue || [];
        this.managedDomains = new Set([...existingDomains, ...newDomains]);
      }
    });
  },

  async handleAccountChange(newAccount, oldAccount) {
    console.log('Account change:', { newAccount, oldAccount });
    if (newAccount) {
      await this.setAccountCookies(newAccount);
    }
  },

  async handleTabClose(tabId) {
    try {
      const tabs = await chrome.tabs.query({});
      console.log('Open tabs:', tabs, 'Managed domains:', this.managedDomains);
      
      for (const domain of this.managedDomains) {
        const cleanDomain = domain.replace(/^\./, '');
        
        const hasOpenTabsForDomain = tabs.some(tab => {
          try {
            if (!tab.url) return false;
            const tabDomain = new URL(tab.url).hostname;
            return tabDomain === cleanDomain || tabDomain.endsWith('.' + cleanDomain);
          } catch {
            return false;
          }
        });

        if (!hasOpenTabsForDomain) {
          console.log('No open tabs for domain:', domain);
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
      console.log('Removing cookies for domain:', domain, cookies);
      
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

      const token = await this.getToken();
      const email = await this.getEmail();
      
      if (email && token) {
        try {
          const response = await fetch(
            `${API_URL}/delete/sessions?email=${encodeURIComponent(email)}&domain=${encodeURIComponent(cleanDomain)}`,
            {
              method: 'DELETE',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              }
            }
          );

          if (!response.ok) {
            console.error('Error in DELETE request:', response.status);
          }
        } catch (error) {
          console.error('Error sending DELETE request:', error);
        }
      }
    } catch (error) {
      console.error(`Error removing cookies for domain ${domain}:`, error);
    }
  },

  async cleanupAllCookies() {
    console.log('Cleaning up all cookies...');
    for (const domain of this.managedDomains) {
      await this.removeCookiesForDomain(domain);
    }
    console.log('Cookie cleanup completed');
  },

  async clearStorage() {
    await chrome.storage.local.remove(['token', 'currentAccount', 'email']);
  },

  async getToken() {
    const result = await chrome.storage.local.get(['token']);
    return result.token;
  },

  async getEmail() {
    const result = await chrome.storage.local.get(['email']);
    return result.email;
  },

  async setAccountCookies(account) {
    if (!account?.cookies?.length) return;

    try {
      const domains = [];
      let retryCount = 0;
      const maxRetries = 3;
      
      for (const cookie of account.cookies) {
        const domain = cookie.domain;
        domains.push(domain);

        let cookiesSet = false;
        while (!cookiesSet && retryCount < maxRetries) {
          try {
            if (cookie.name === 'header_cookies') {
              await this.setHeaderCookies(domain, cookie.value);
            } else {
              await this.setCookie(domain, cookie.name, cookie.value);
            }
            cookiesSet = await this.verifyCookie(domain, cookie.name);
          } catch (error) {
            console.error(`Error setting cookie, attempt ${retryCount + 1}:`, error);
          }
          
          if (!cookiesSet) {
            retryCount++;
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
      }

      domains.forEach(domain => this.managedDomains.add(domain));
      await chrome.storage.local.set({ 
        managedDomains: Array.from(this.managedDomains) 
      });
      
      console.log('Account cookies set:', account);
      console.log('Managed domains updated:', this.managedDomains);
    } catch (error) {
      console.error('Error setting account cookies:', error);
    }
  },

  async verifyCookie(domain, name) {
    const cleanDomain = domain.startsWith('.') ? domain.substring(1) : domain;
    const cookies = await chrome.cookies.getAll({ domain: cleanDomain, name });
    return cookies.length > 0;
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
        throw retryError;
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
  }
};

// Initialize the cookie manager
cookieManager.init();