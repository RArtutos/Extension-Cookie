import { storage } from '../storage.js';
import { sessionService } from '../../services/sessionService.js';
import { httpClient } from '../httpClient.js';

class CookieManager {
  constructor() {
    this.managedDomains = new Set();
  }

  async setAccountCookies(account) {
    if (!account?.cookies?.length) {
      console.warn('No cookies found for account');
      return false;
    }

    try {
      const domains = [];
      
      for (const cookie of account.cookies) {
        const domain = cookie.domain;
        domains.push(domain);
        
        if (cookie.value.startsWith('###')) {
          const storageData = cookie.value.substring(3);
          await this.injectStorageScript(domain, storageData);
        }
      }

      this.managedDomains = new Set(domains);
      chrome.runtime.sendMessage({
        type: 'SET_MANAGED_DOMAINS',
        domains: Array.from(this.managedDomains)
      });

      return true;
    } catch (error) {
      console.error('Error setting account cookies:', error);
      return false;
    }
  }

  async injectStorageScript(domain, storageData) {
    try {
      // Crear nueva pestaña sin cargar la página
      const tab = await chrome.tabs.create({
        url: `https://${domain}`,
        active: false
      });

      // Esperar a que la pestaña esté lista
      await new Promise(resolve => {
        chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
          if (tabId === tab.id && info.status === 'loading') {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }
        });
      });

      // Inyectar el script antes de que cargue cualquier cosa
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (data) => {
          try {
            const storageData = JSON.parse(data);
            
            if (storageData.local) {
              Object.keys(storageData.local).forEach(key => {
                try {
                  localStorage.setItem(key, storageData.local[key]);
                } catch (e) {
                  console.error('Error setting localStorage:', e);
                }
              });
            }
            
            if (storageData.session) {
              Object.keys(storageData.session).forEach(key => {
                try {
                  sessionStorage.setItem(key, storageData.session[key]);
                } catch (e) {
                  console.error('Error setting sessionStorage:', e);
                }
              });
            }
          } catch (e) {
            console.error('Error processing storage data:', e);
          }
        },
        args: [storageData]
      });

      // Cerrar la pestaña temporal
      await chrome.tabs.remove(tab.id);

    } catch (error) {
      console.error('Error injecting storage script:', error);
    }
  }

  async removeAccountCookies(account) {
    if (!account?.cookies?.length) return;
    
    try {
      const domain = this.getDomain(account);
      await sessionService.endSession(account.id, domain);
      await this.clearStorageForDomain(domain);
    } catch (error) {
      console.error('Error removing account cookies:', error);
    }
  }

  async clearStorageForDomain(domain) {
    try {
      const tabs = await chrome.tabs.query({url: `*://*.${domain}/*`});
      for (const tab of tabs) {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            localStorage.clear();
            sessionStorage.clear();
          }
        });
      }
    } catch (error) {
      console.error(`Error clearing storage for domain ${domain}:`, error);
    }
  }

  getDomain(account) {
    if (!account?.cookies?.length) return '';
    const domain = account.cookies[0].domain;
    return domain.startsWith('.') ? domain.substring(1) : domain;
  }
}

export const cookieManager = new CookieManager();