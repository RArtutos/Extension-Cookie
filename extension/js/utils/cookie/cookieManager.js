import { storage } from '../storage.js';

class CookieManager {
  constructor() {
    this.managedDomains = new Set();
  }

  async setAccountCookies(account) {
    if (!account?.cookies?.length) {
      console.warn('No cookies found for account');
      return;
    }

    try {
      const domains = [];
      
      for (const cookie of account.cookies) {
        const domain = cookie.domain;
        domains.push(domain);
        
        if (cookie.name === 'header_cookies') {
          await this.setHeaderCookies(domain, cookie.value);
        } else {
          await this.setCookie(domain, cookie.name, cookie.value);
        }
      }

      // Update managed domains in background
      chrome.runtime.sendMessage({
        type: 'SET_MANAGED_DOMAINS',
        domains
      });

    } catch (error) {
      console.error('Error setting account cookies:', error);
      throw new Error('Failed to set account cookies');
    }
  }

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
      await chrome.cookies.set({
        url,
        name,
        value,
        domain: cleanDomain,
        path: '/',
        secure: false,
        sameSite: 'no_restriction'
      });
    }
  }

  async setHeaderCookies(domain, cookieString) {
    const cookies = this.parseHeaderString(cookieString);
    for (const cookie of cookies) {
      await this.setCookie(domain, cookie.name, cookie.value);
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
}

export const cookieManager = new CookieManager();