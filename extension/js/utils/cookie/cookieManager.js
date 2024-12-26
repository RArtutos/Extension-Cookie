import { storage } from '../storage.js';
import { sessionService } from '../../services/sessionService.js';
import { httpClient } from '../httpClient.js';
import { cookieParser } from './cookieParser.js';

class CookieManager {
  constructor() {
    this.managedDomains = new Set();
    this.maxRetries = 3;
    this.retryDelay = 100;
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
        
        if (cookie.name === 'header_cookies') {
          const parsedCookies = cookieParser.parseHeaderString(cookie.value);
          for (const parsedCookie of parsedCookies) {
            await this.setCookieWithRetry(domain, parsedCookie.name, parsedCookie.value);
          }
        } else {
          await this.setCookieWithRetry(domain, cookie.name, cookie.value);
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

  async setCookieWithRetry(domain, name, value) {
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        await this.setCookie(domain, name, value);
        return true;
      } catch (error) {
        if (attempt === this.maxRetries - 1) {
          console.error(`Failed to set cookie ${name} after ${this.maxRetries} attempts`);
          throw error;
        }
        await new Promise(resolve => setTimeout(resolve, this.retryDelay));
      }
    }
    return false;
  }

  async setCookie(domain, name, value) {
    const cleanDomain = domain.startsWith('.') ? domain.substring(1) : domain;
    const url = `https://${cleanDomain}`;
    
    const cookieConfig = {
      url,
      name,
      value,
      path: '/',
      secure: true,
      sameSite: 'lax'
    };

    // No incluir domain para cookies __Host-
    if (!name.startsWith('__Host-')) {
      cookieConfig.domain = domain;
    }

    try {
      await chrome.cookies.set(cookieConfig);
    } catch (error) {
      if (!name.startsWith('__Host-')) {
        // Intentar configuración alternativa solo para cookies que no son __Host-
        await chrome.cookies.set({
          ...cookieConfig,
          domain: cleanDomain,
          secure: false,
          sameSite: 'no_restriction'
        });
      } else {
        throw error;
      }
    }
  }

  async removeAccountCookies(account) {
    if (!account?.cookies?.length) return;
    
    try {
      const domain = this.getDomain(account);
      await sessionService.endSession(account.id, domain);
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
        const protocol = cookie.secure ? 'https://' : 'http://';
        await chrome.cookies.remove({
          url: `${protocol}${cleanDomain}${cookie.path}`,
          name: cookie.name
        });
      } catch (error) {
        console.warn(`Error removing cookie ${cookie.name}:`, error);
      }
    }
  }

  getDomain(account) {
    if (!account?.cookies?.length) return '';
    const domain = account.cookies[0].domain;
    return domain.startsWith('.') ? domain.substring(1) : domain;
  }
}

export const cookieManager = new CookieManager();