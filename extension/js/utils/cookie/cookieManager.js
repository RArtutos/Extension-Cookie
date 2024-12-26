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
          await this.setStorageData(domain, storageData);
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

  async setStorageData(domain, storageDataStr) {
    try {
      const storageData = JSON.parse(storageDataStr);
      const cleanDomain = domain.startsWith('.') ? domain.substring(1) : domain;

      // Función para inyectar el storage
      const injectStorage = async (tabId) => {
        // Primero inyectamos una función helper
        await chrome.scripting.executeScript({
          target: { tabId },
          func: function() {
            window.__storageInjected = false;
            window.__injectStorage = function(data) {
              try {
                if (data.local) {
                  Object.keys(data.local).forEach(key => {
                    localStorage.setItem(key, data.local[key]);
                  });
                }
                if (data.session) {
                  Object.keys(data.session).forEach(key => {
                    sessionStorage.setItem(key, data.session[key]);
                  });
                }
                window.__storageInjected = true;
                return true;
              } catch (e) {
                console.error('Error injecting storage:', e);
                return false;
              }
            };
          }
        });

        // Luego inyectamos los datos
        await chrome.scripting.executeScript({
          target: { tabId },
          func: function(storageData) {
            return window.__injectStorage(storageData);
          },
          args: [storageData]
        });

        // Verificamos que se haya inyectado correctamente
        const results = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => window.__storageInjected
        });

        return results[0]?.result === true;
      };

      // Buscar pestañas existentes
      const tabs = await chrome.tabs.query({
        url: `*://*.${cleanDomain}/*`
      });
      
      if (tabs.length > 0) {
        // Actualizar pestañas existentes
        for (const tab of tabs) {
          const success = await injectStorage(tab.id);
          if (!success) {
            console.warn(`Failed to inject storage in tab ${tab.id}`);
          }
        }
      } else {
        // Crear pestaña temporal
        const tab = await chrome.tabs.create({
          url: `https://${cleanDomain}`,
          active: false
        });

        // Esperar a que la página esté completamente cargada
        await new Promise(resolve => {
          const listener = (tabId, info) => {
            if (tabId === tab.id && info.status === 'complete') {
              chrome.tabs.onUpdated.removeListener(listener);
              resolve();
            }
          };
          chrome.tabs.onUpdated.addListener(listener);
        });

        // Intentar inyectar el storage varias veces
        let success = false;
        for (let i = 0; i < 3 && !success; i++) {
          success = await injectStorage(tab.id);
          if (!success) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }

        // Cerrar la pestaña temporal
        await chrome.tabs.remove(tab.id);

        if (!success) {
          throw new Error('Failed to inject storage after multiple attempts');
        }
      }

    } catch (error) {
      console.error('Error setting storage data:', error);
      throw error;
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
      const tabs = await chrome.tabs.query({
        url: `*://*.${domain}/*`
      });
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
