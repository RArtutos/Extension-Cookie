export function parseHeaderString(cookieString) {
  if (!cookieString) return [];
  
  const cookies = [];
  const pairs = cookieString.split(';');
  
  for (const pair of pairs) {
    const trimmedPair = pair.trim();
    if (!trimmedPair) continue;
    
    const firstEquals = trimmedPair.indexOf('=');
    if (firstEquals === -1) continue;
    
    const name = trimmedPair.substring(0, firstEquals).trim();
    const value = trimmedPair.substring(firstEquals + 1).trim();
    
    if (name && value) {
      cookies.push({ name, value });
    }
  }
  
  return cookies;
}

export function stringifyCookies(cookies) {
  return cookies
    .map(cookie => `${cookie.name}=${cookie.value}`)
    .join('; ');
}