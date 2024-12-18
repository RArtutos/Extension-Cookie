export class CookieSetter {
  async setCookie(domain, name, value) {
    const cleanDomain = domain.startsWith('.') ? domain.substring(1) : domain;
    const url = `https://${cleanDomain}`;
    
    try {
      await this.setWithDefaultOptions(url, domain, name, value);
    } catch (error) {
      console.warn(`Error setting cookie ${name}, retrying with alternative settings:`, error);
      try {
        await this.setWithFallbackOptions(url, cleanDomain, name, value);
      } catch (retryError) {
        console.error(`Failed to set cookie ${name} after retry:`, retryError);
        throw retryError;
      }
    }
  }

  private async setWithDefaultOptions(url: string, domain: string, name: string, value: string) {
    await chrome.cookies.set({
      url,
      name,
      value,
      domain,
      path: '/',
      secure: true,
      sameSite: 'lax'
    });
  }

  private async setWithFallbackOptions(url: string, domain: string, name: string, value: string) {
    await chrome.cookies.set({
      url,
      name,
      value,
      domain,
      path: '/',
      secure: false,
      sameSite: 'no_restriction'
    });
  }
}