export class CookieParser {
  parseHeaderString(cookieString) {
    if (!cookieString) return [];
    
    const cookies = [];
    const pairs = cookieString.split(';');
    
    for (const pair of pairs) {
      const [name, value] = pair.trim().split('=');
      if (name && value) {
        cookies.push({ 
          name: name.trim(), 
          value: value.trim() 
        });
      }
    }
    
    return cookies;
  }

  stringifyCookies(cookies) {
    return cookies
      .map(cookie => `${cookie.name}=${cookie.value}`)
      .join('; ');
  }
}