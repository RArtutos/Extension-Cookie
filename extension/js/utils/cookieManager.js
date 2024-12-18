class CookieManager {
  async setAccountCookies(account) {
    if (!account?.cookies?.length) {
      console.warn('No cookies found for account');
      return;
    }

    try {
      for (const cookie of account.cookies) {
        const domain = cookie.domain;
        
        // Remove existing cookies first
        await this.removeAllCookiesForDomain(domain);

        // Set new cookies
        if (cookie.name === 'header_cookies') {
          await this.setHeaderCookies(domain, cookie.value);
        } else {
          await this.setCookie(domain, cookie.name, cookie.value);
        }
      }
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

  async removeAccountCookies(account) {
    if (!account?.cookies?.length) return;
    
    for (const cookie of account.cookies) {
      await this.removeAllCookiesForDomain(cookie.domain);
    }
  }

  async removeAllCookiesForDomain(domain) {
    const cleanDomain = domain.startsWith('.') ? domain.substring(1) : domain;
    const cookies = await chrome.cookies.getAll({ domain: cleanDomain });
    
    for (const cookie of cookies) {
      try {
        await chrome.cookies.remove({
          url: `https://${cleanDomain}`,
          name: cookie.name
        });
      } catch (error) {
        console.warn(`Error removing cookie ${cookie.name}:`, error);
      }
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