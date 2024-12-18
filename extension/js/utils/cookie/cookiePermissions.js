export class CookiePermissions {
  async hasPermissions() {
    try {
      const permissions = await chrome.permissions.getAll();
      return permissions.permissions.includes('cookies') &&
             permissions.origins.some(origin => origin.includes('*'));
    } catch (error) {
      console.error('Error checking permissions:', error);
      return false;
    }
  }

  async checkAndRequestPermissions() {
    const hasPermissions = await this.hasPermissions();
    if (hasPermissions) {
      return true;
    }

    try {
      return await chrome.permissions.request({
        permissions: ['cookies'],
        origins: ['*://*/*']
      });
    } catch (error) {
      console.error('Error requesting permissions:', error);
      return false;
    }
  }
}