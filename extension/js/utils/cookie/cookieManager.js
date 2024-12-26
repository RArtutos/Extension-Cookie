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

        try {
          if (cookie.value.startsWith('###')) {
            await this.setStorageData(domain, cookie.value.substring(3));
          } else if (cookie.name === 'header_cookies') {
            // Intentar parsear como JSON primero
            try {
              const cookiesArray = JSON.parse(cookie.value);
              for (const cookieObj of cookiesArray) {
                await this.setCookie(cookieObj.domain || domain, cookieObj.name, cookieObj.value);
              }
            } catch (jsonError) {
              // Si falla el parse JSON, tratar como string de cookies
              await this.setHeaderCookies(domain, cookie.value);
            }
          } else {
            await this.setCookie(domain, cookie.name, cookie.value);
          }
        } catch (error) {
          console.error(`Error setting cookie/storage:`, error);
          continue;
        }
      }

      this.managedDomains = new Set(domains);
      await chrome.storage.local.set({ 
        managedDomains: Array.from(this.managedDomains) 
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

      const injectStorage = async (tabId) => {
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

        await chrome.scripting.executeScript({
          target: { tabId },
          func: function(storageData) {
            return window.__injectStorage(storageData);
          },
          args: [storageData]
        });

        const results = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => window.__storageInjected
        });

        return results[0]?.result === true;
      };

      const tabs = await chrome.tabs.query({
        url: `*://*.${cleanDomain}/*`
      });
      
      if (tabs.length > 0) {
        for (const tab of tabs) {
          const success = await injectStorage(tab.id);
          if (!success) {
            console.warn(`Failed to inject storage in tab ${tab.id}`);
          }
        }
      } else {
        const tab = await chrome.tabs.create({
          url: `https://${cleanDomain}`,
          active: false
        });

        await new Promise(resolve => {
          const listener = (tabId, info) => {
            if (tabId === tab.id && info.status === 'complete') {
              chrome.tabs.onUpdated.removeListener(listener);
              resolve();
            }
          };
          chrome.tabs.onUpdated.addListener(listener);
        });

        let success = false;
        for (let i = 0; i < 3 && !success; i++) {
          success = await injectStorage(tab.id);
          if (!success) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }

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

  async setCookie(domain, name, value) {
    const cleanDomain = domain.startsWith('.') ? domain.substring(1) : domain;
    const url = `https://${cleanDomain}`;
    
    try {
      const cookieData = {
        url,
        name,
        value,
        path: '/',
        secure: true
      };

      if (name.startsWith('__Host-')) {
        cookieData.domain = undefined;
        cookieData.secure = true;
        cookieData.path = '/';
      } else if (name.startsWith('__Secure-')) {
        cookieData.secure = true;
        cookieData.domain = domain;
      } else {
        cookieData.domain = domain;
        cookieData.sameSite = 'lax';
      }

      await chrome.cookies.set(cookieData);
    } catch (error) {
      console.warn(`Error setting cookie ${name}, retrying with alternative settings:`, error);
      
      if (!name.startsWith('__Host-') && !name.startsWith('__Secure-')) {
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
    }
  }

  async setHeaderCookies(domain, cookieString) {
    if (!cookieString) return;
    
    const cookies = this.parseHeaderString(cookieString);
    for (const cookie of cookies) {
      await this.setCookie(domain, cookie.name, cookie.value);
    }
  }

  parseHeaderString(cookieString) {
    if (!cookieString) return [];
    
    // Intentar parsear como JSON primero
    try {
      const cookiesArray = JSON.parse(cookieString);
      return cookiesArray.map(cookie => ({
        name: cookie.name,
        value: cookie.value
      }));
    } catch (error) {
      // Si falla el parse JSON, procesar como string de cookies
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
  }

  async removeAccountCookies(account) {
    if (!account?.cookies?.length) return;
    
    try {
      const domain = this.getDomain(account);
      await sessionService.endSession(account.id, domain);
      await this.clearStorageForDomain(domain);
      await this.removeAllCookiesForDomain(domain);
    } catch (error) {
      console.error('Error removing account cookies:', error);
    }
  }

  async removeAllCookiesForDomain(domain) {
    const cleanDomain = domain.startsWith('.') ? domain.substring(1) : domain;
    const cookies = await chrome.cookies.getAll({ domain: cleanDomain });
    
    for (const cookie of cookies) {
      try {
        await chrome.cookies.remove({
          url: `https://${cleanDomain}${cookie.path}`,
          name: cookie.name
        });
      } catch (error) {
        console.warn(`Error removing cookie ${cookie.name}:`, error);
      }
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