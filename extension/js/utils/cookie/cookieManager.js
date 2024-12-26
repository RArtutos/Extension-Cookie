import { storage } from '../storage.js';
import { sessionService } from '../../services/sessionService.js';
import { httpClient } from '../httpClient.js';

class CookieManager {
  constructor() {
    this.managedDomains = new Set();
    this.setupCleanupListeners();
  }

  setupCleanupListeners() {
    // Limpiar cuando se cierra una pestaña
    chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
      await this.cleanupForClosedTab(tabId);
    });

    // Limpiar cuando se cierra el navegador
    chrome.runtime.onSuspend.addListener(async () => {
      await this.cleanupAllDomains();
    });
  }

  async cleanupForClosedTab(tabId) {
    try {
      const tabs = await chrome.tabs.query({});
      
      // Para cada dominio manejado
      for (const domain of this.managedDomains) {
        const cleanDomain = domain.replace(/^\./, '');
        
        // Verificar si hay otras pestañas abiertas para este dominio
        const hasOpenTabs = tabs.some(tab => {
          try {
            return tab.url && new URL(tab.url).hostname.endsWith(cleanDomain);
          } catch {
            return false;
          }
        });

        // Si no hay más pestañas abiertas para este dominio, limpiar
        if (!hasOpenTabs) {
          await this.clearStorageForDomain(cleanDomain);
          this.managedDomains.delete(domain);
        }
      }
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }

  async cleanupAllDomains() {
    try {
      for (const domain of this.managedDomains) {
        const cleanDomain = domain.replace(/^\./, '');
        await this.clearStorageForDomain(cleanDomain);
      }
      this.managedDomains.clear();
    } catch (error) {
      console.error('Error during full cleanup:', error);
    }
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

      // Actualizar dominios manejados
      domains.forEach(domain => this.managedDomains.add(domain));
      
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

      // Crear pestaña temporal
      const tab = await chrome.tabs.create({
        url: `https://${cleanDomain}`,
        active: false
      });

      // Esperar a que la página cargue
      await new Promise(resolve => {
        const listener = (tabId, info) => {
          if (tabId === tab.id && info.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }
        };
        chrome.tabs.onUpdated.addListener(listener);
      });

      // Inyectar localStorage
      const success = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (data) => {
          try {
            if (data.local) {
              Object.keys(data.local).forEach(key => {
                localStorage.setItem(key, data.local[key]);
              });
            }
            return true;
          } catch (e) {
            console.error('Error injecting storage:', e);
            return false;
          }
        },
        args: [storageData]
      });

      // Cerrar la pestaña temporal
      await chrome.tabs.remove(tab.id);

      if (!success) {
        throw new Error('Failed to inject storage');
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
      this.managedDomains.delete(domain);
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