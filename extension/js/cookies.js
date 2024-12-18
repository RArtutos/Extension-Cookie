export const cookieManager = {
  async requestPermissions() {
    try {
      const granted = await chrome.permissions.request({
        permissions: ['cookies'],
        origins: ['<all_urls>']
      });
      return granted;
    } catch (error) {
      console.error('Error requesting permissions:', error);
      return false;
    }
  },

  async removeCookie(url, name) {
    try {
      await chrome.cookies.remove({ url, name });
    } catch (error) {
      console.error(`Error removing cookie ${name}:`, error);
    }
  }
};