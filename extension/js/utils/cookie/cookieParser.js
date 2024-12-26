export class CookieParser {
  parseHeaderString(cookieString) {
    if (!cookieString) return [];
    
    const cookies = [];
    const pairs = cookieString.split(';');
    
    for (const pair of pairs) {
      const trimmedPair = pair.trim();
      const equalIndex = trimmedPair.indexOf('=');
      
      if (equalIndex > 0) {
        const name = trimmedPair.substring(0, equalIndex).trim();
        const value = trimmedPair.substring(equalIndex + 1).trim();
        
        if (name && value) {
          cookies.push({
            name,
            value: this.sanitizeCookieValue(value)
          });
        }
      }
    }
    
    return cookies;
  }

  sanitizeCookieValue(value) {
    // Si el valor está codificado con URI, dejarlo así
    if (value.includes('%')) {
      return value;
    }

    try {
      // Para valores JSON, mantenerlos como están
      if ((value.startsWith('{') && value.endsWith('}')) ||
          (value.startsWith('[') && value.endsWith(']'))) {
        JSON.parse(value); // Validar que sea JSON válido
        return value;
      }
      
      // Para otros valores, codificar si contienen caracteres especiales
      return /[,;\\/ ]/.test(value) ? encodeURIComponent(value) : value;
    } catch (error) {
      // Si hay error al parsear JSON, devolver el valor original
      return value;
    }
  }

  stringifyCookies(cookies) {
    return cookies
      .map(cookie => `${cookie.name}=${cookie.value}`)
      .join('; ');
  }
}

export const cookieParser = new CookieParser();