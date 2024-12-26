import { storage } from './storage.js';
import { httpClient } from './httpClient.js';

class TabTracker {
  constructor() {
    this.tabAccounts = new Map();
    this.debug = true;
  }

  async trackTab(tabId, account) {
    if (this.debug) console.log('Tracking tab:', tabId, 'for account:', account.id);
    this.tabAccounts.set(tabId, account);
    
    try {
      // Incrementar usuarios activos en el backend
      await httpClient.post(`/api/accounts/${account.id}/active`);
      if (this.debug) console.log('Incremented active users for account:', account.id);
    } catch (error) {
      console.error('Error incrementing active users:', error);
    }
  }

  async untrackTab(tabId) {
    const account = this.tabAccounts.get(tabId);
    if (account) {
      if (this.debug) console.log('Untracking tab:', tabId, 'for account:', account.id);
      try {
        // Decrementar usuarios activos en el backend
        const response = await httpClient.delete(`/api/accounts/${account.id}/active`);
        if (this.debug) console.log('Decremented active users for account:', account.id, response);
      } catch (error) {
        console.error('Error decrementing active users:', error);
      }
      this.tabAccounts.delete(tabId);
    }
  }

  getAccountByTab(tabId) {
    return this.tabAccounts.get(tabId);
  }

  // Método para debugging
  logState() {
    console.log('Current tab tracking state:', 
      Array.from(this.tabAccounts.entries())
        .map(([tabId, account]) => ({tabId, accountId: account.id}))
    );
  }
}

export const tabTracker = new TabTracker();

// Exportar para debugging
if (typeof window !== 'undefined') {
  window.tabTracker = tabTracker;
}