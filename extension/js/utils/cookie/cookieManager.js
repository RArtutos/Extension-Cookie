import { storage } from '../storage.js';
import { sessionService } from '../../services/sessionService.js';
import { httpClient } from '../httpClient.js';

class CookieManager {
  constructor() {
    this.managedDomains = new Set();
    this.cookieCache = new Map();
  }

  async setAccountCookies(account) {
    if (!account?.cookies?.length) {
      console.warn('No cookies found for account');
      return false;
    }

    try {
      const domains = [];
      this.cookieCache.clear();
      
      for (const cookie of account.cookies) {
        const domain = cookie.domain;
        domains.push(domain);

        try {
          if (cookie.value.startsWith('###')) {
            await this.setStorageData(domain, cookie.value.substring(3));
          } else if (cookie.name === 'header_cookies') {
            try {
              const cookiesArray = JSON.parse(cookie.value);
              for (const cookieObj of cookiesArray) {
                const cookieDomain = cookieObj.domain || domain;
                await this.setCookie(cookieDomain, cookieObj.name, cookieObj.value);
                if (!this.cookieCache.has(cookieDomain)) {
                  this.cookieCache.set(cookieDomain, new Set());
                }
                this.cookieCache.get(cookieDomain).add(cookieObj.name);
              }
            } catch (jsonError) {
              await this.setHeaderCookies(domain, cookie.value);
            }
          } else {
            await this.setCookie(domain, cookie.name, cookie.value);
            if (!this.cookieCache.has(domain)) {
              this.cookieCache.set(domain, new Set());
            }
            this.cookieCache.get(domain).add(cookie.name);
          }
        } catch (error) {
          console.error(`Error setting cookie/storage:`, error);
          continue;
        }
      }

      this.managedDomains = new Set(domains);
      await chrome.storage.local.set({ 
        managedDomains: Array.from(this.managedDomains),
        cookieCache: JSON.stringify(Array.from(this.cookieCache).map(([domain, names]) => ({
          domain,
          names: Array.from(names)
        })))
      });
      
      return true;
    } catch (error) {
      console.error('Error setting account cookies:', error);
      return false;
    }
  }

  async removeAccountCookies(account) {
    if (!account?.cookies?.length) return;
    
    try {
      const result = await chrome.storage.local.get(['cookieCache']);
      if (result.cookieCache) {
        const cachedCookies = JSON.parse(result.cookieCache);
        
        for (const {domain, names} of cachedCookies) {
          await sessionService.endSession(account.id, domain);
          await this.clearStorageForDomain(domain);
          
          for (const name of names) {
            await this.removeCookie(domain, name);
          }
          
          await this.removeAllCookiesForDomain(domain);
        }
      }

      for (const cookie of account.cookies) {
        const domain = cookie.domain;
        
        if (cookie.name === 'header_cookies') {
          try {
            const cookiesArray = JSON.parse(cookie.value);
            for (const cookieObj of cookiesArray) {
              const cookieDomain = cookieObj.domain || domain;
              await this.removeCookie(cookieDomain, cookieObj.name);
            }
          } catch (jsonError) {
            await this.removeAllCookiesForDomain(domain);
          }
        } else {
          await this.removeCookie(domain, cookie.name);
        }
      }

      this.cookieCache.clear();
      await chrome.storage.local.remove(['cookieCache']);

    } catch (error) {
      console.error('Error removing account cookies:', error);
    }
  }

  async removeCookie(domain, name) {
    const cleanDomain = domain.startsWith('.') ? domain.substring(1) : domain;
    try {
      const urls = [
        `https://${cleanDomain}`,
        `https://${cleanDomain}/`,
        `http://${cleanDomain}`,
        `http://${cleanDomain}/`
      ];

      for (const url of urls) {
        try {
          await chrome.cookies.remove({
            url,
            name: name
          });
        } catch (e) {
          console.warn(`Failed to remove cookie ${name} with URL ${url}:`, e);
        }
      }
    } catch (error) {
      console.warn(`Error removing cookie ${name}:`, error);
    }
  }

  async removeAllCookiesForDomain(domain) {
    const cleanDomain = domain.startsWith('.') ? domain.substring(1) : domain;
    try {
        // Obtener todas las cookies del dominio y subdominios
        const cookies = await chrome.cookies.getAll({ 
            domain: cleanDomain 
        });
        
        console.log(`Found ${cookies.length} cookies for domain ${cleanDomain}`);
        
        for (const cookie of cookies) {
            // Construir todas las variantes posibles de URL
            const urls = [
                `https://${cleanDomain}${cookie.path}`,
                `https://.${cleanDomain}${cookie.path}`,
                `http://${cleanDomain}${cookie.path}`,
                `http://.${cleanDomain}${cookie.path}`
            ];

            // Intentar eliminar la cookie con cada variante de URL
            for (const url of urls) {
                try {
                    await chrome.cookies.remove({
                        url,
                        name: cookie.name,
                        storeId: cookie.storeId
                    });
                    console.log(`Successfully removed cookie ${cookie.name} with URL ${url}`);
                } catch (error) {
                    console.warn(`Failed to remove cookie ${cookie.name} with URL ${url}:`, error);
                }
            }

            // Intento adicional con el dominio exacto de la cookie
            try {
                const exactUrl = `${cookie.secure ? 'https' : 'http'}://${cookie.domain.startsWith('.') ? cookie.domain.slice(1) : cookie.domain}${cookie.path}`;
                await chrome.cookies.remove({
                    url: exactUrl,
                    name: cookie.name,
                    storeId: cookie.storeId
                });
                console.log(`Successfully removed cookie ${cookie.name} with exact URL ${exactUrl}`);
            } catch (error) {
                console.warn(`Failed to remove cookie ${cookie.name} with exact domain:`, error);
            }
        }
    } catch (error) {
        console.error(`Error removing all cookies for domain ${domain}:`, error);
    }
}

  async setStorageData(domain, storageDataStr) {
    try {
      const storageData = JSON.parse(storageDataStr);
      const cleanDomain = domain.startsWith('.') ? domain.substring(1) : domain;

      const tabs = await chrome.tabs.query({
        url: `*://*.${cleanDomain}/*`
      });

      for (const tab of tabs) {
        await this.injectStorageData(tab.id, storageData);
      }
    } catch (error) {
      console.error('Error setting storage data:', error);
      throw error;
    }
  }

  async injectStorageData(tabId, storageData) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        func: (data) => {
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
          return true;
        },
        args: [storageData]
      });
    } catch (error) {
      console.error('Error injecting storage data:', error);
      throw error;
    }
  }

  async clearStorageForDomain(domain) {
    try {
      const cleanDomain = domain.startsWith('.') ? domain.substring(1) : domain;
      const tabs = await chrome.tabs.query({
        url: `*://*.${cleanDomain}/*`
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

  async setCookie(domain, name, value) {
    const cleanDomain = domain.startsWith('.') ? domain.substring(1) : domain;
    const url = `https://${cleanDomain}`;
    
    try {
      const cookieData = {
        url,
        name,
        value,
        domain,
        path: '/',
        secure: true,
        sameSite: 'lax'
      };

      if (name.startsWith('__Host-')) {
        cookieData.domain = undefined;
        cookieData.secure = true;
        cookieData.path = '/';
      } else if (name.startsWith('__Secure-')) {
        cookieData.secure = true;
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
          throw retryError;
        }
      }
    }
  }

  async setHeaderCookies(domain, cookieString) {
    if (!cookieString) return;
    
    const cookies = this.parseHeaderString(cookieString);
    for (const cookie of cookies) {
      await this.setCookie(domain, cookie.name, cookie.value);
      if (!this.cookieCache.has(domain)) {
        this.cookieCache.set(domain, new Set());
      }
      this.cookieCache.get(domain).add(cookie.name);
    }
  }

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

  getDomain(account) {
    if (!account?.cookies?.length) return '';
    const domain = account.cookies[0].domain;
    return domain.startsWith('.') ? domain.substring(1) : domain;
  }
}

export const cookieManager = new CookieManager();