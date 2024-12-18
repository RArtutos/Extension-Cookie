import { accountService } from './services/accountService.js';
import { sessionManager } from './services/sessionManagerInstance.js'; // Updated import path
import { cookieManager } from './utils/cookie/cookieManager.js';
import { analyticsService } from './services/analyticsService.js';
import { ui } from './utils/ui.js';
import { storage } from './utils/storage.js';

class AccountManager {
  constructor() {
    this.currentAccount = null;
    this.initializeEventListeners();
  }

  initializeEventListeners() {
    // Monitor tab activity
    chrome.tabs.onActivated.addListener(async (activeInfo) => {
      const tab = await chrome.tabs.get(activeInfo.tabId);
      if (tab.url) {
        const domain = new URL(tab.url).hostname;
        await this.handleTabActivity(domain);
      }
    });

    // Monitor URL changes
    chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
      if (changeInfo.url) {
        const domain = new URL(changeInfo.url).hostname;
        await this.handleTabActivity(domain);
      }
    });

    // Monitor browser close
    chrome.runtime.onSuspend.addListener(async () => {
      await sessionManager.cleanupCurrentSession();
    });
  }

  async handleTabActivity(domain) {
    const currentAccount = await storage.get('currentAccount');
    if (!currentAccount) return;

    try {
      await sessionManager.updateSessionStatus(currentAccount.id);
      await analyticsService.trackPageView(domain);
    } catch (error) {
      console.error('Error handling tab activity:', error);
      if (error.message.includes('Session limit reached')) {
        await sessionManager.cleanupCurrentSession();
        ui.showError('Session expired: maximum concurrent users reached');
      }
    }
  }

  async switchAccount(account) {
    try {
      // End current session if exists
      await sessionManager.cleanupCurrentSession();

      // Check session limits
      await sessionManager.updateSessionStatus(account.id);

      // Set new cookies
      await cookieManager.setAccountCookies(account);

      // Start new session
      const domain = this.getFirstDomain(account);
      if (domain) {
        await sessionManager.startSession(account.id, domain);
        await analyticsService.trackAccountSwitch(this.currentAccount, account);
        
        // Store current account
        await storage.set('currentAccount', account);
        this.currentAccount = account;

        // Open domain in new tab
        chrome.tabs.create({ url: `https://${domain}` });
      }

      ui.showSuccess('Account switched successfully');

      // Refresh accounts list
      const accounts = await accountService.getAccounts();
      ui.updateAccountsList(accounts, account);

    } catch (error) {
      console.error('Error switching account:', error);
      ui.showError(error.message || 'Error switching account');
      throw error;
    }
  }

  getFirstDomain(account) {
    if (!account?.cookies?.length) return null;
    const domain = account.cookies[0].domain;
    return domain.startsWith('.') ? domain.substring(1) : domain;
  }
}

export const accountManager = new AccountManager();