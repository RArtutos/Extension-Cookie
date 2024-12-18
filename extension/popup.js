import { API_URL, STORAGE_KEYS, UI_CONFIG } from './js/config.js';
import { storage } from './js/utils/storage.js';
import { ui } from './js/utils/ui.js';
import { accountManager } from './js/accountManager.js';
import { cookieService } from './js/services/cookieService.js';

class PopupManager {
  constructor() {
    this.initialized = false;
    this.refreshInterval = null;
  }

  async init() {
    if (this.initialized) return;
    
    this.attachEventListeners();
    await this.checkAuthState();
    this.initialized = true;
  }

  attachEventListeners() {
    // Login form
    document.getElementById('login-btn')?.addEventListener('click', () => this.handleLogin());
    
    // Logout button
    document.getElementById('logout-btn')?.addEventListener('click', () => this.handleLogout());
    
    // Proxy toggle
    document.getElementById('use-proxy')?.addEventListener('change', (e) => this.handleProxyToggle(e));
    
    // Close button
    document.getElementById('close-btn')?.addEventListener('click', () => window.close());
  }

  async checkAuthState() {
    const token = await storage.get(STORAGE_KEYS.TOKEN);
    if (token) {
      await this.showAccountManager();
    } else {
      ui.showLoginForm();
    }
  }

  async handleLogin() {
    const email = document.getElementById('email')?.value;
    const password = document.getElementById('password')?.value;

    if (!email || !password) {
      ui.showError('Please enter both email and password');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `username=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`,
      });

      if (!response.ok) {
        throw new Error('Invalid credentials');
      }

      const data = await response.json();
      if (!data.access_token) {
        throw new Error('Invalid response from server');
      }

      await storage.set(STORAGE_KEYS.TOKEN, data.access_token);
      await this.showAccountManager();
      ui.showSuccess('Login successful');
    } catch (error) {
      console.error('Login failed:', error);
      ui.showError('Login failed. Please check your credentials and try again.');
    }
  }

  async handleLogout() {
    try {
      // Clear current account cookies
      const currentAccount = await storage.get(STORAGE_KEYS.CURRENT_ACCOUNT);
      if (currentAccount) {
        await cookieService.removeAllCookies(currentAccount.domain);
      }

      // Clear storage
      await storage.remove([
        STORAGE_KEYS.TOKEN,
        STORAGE_KEYS.CURRENT_ACCOUNT,
        STORAGE_KEYS.PROXY_ENABLED,
        STORAGE_KEYS.USER_SETTINGS
      ]);

      // Stop refresh interval
      if (this.refreshInterval) {
        clearInterval(this.refreshInterval);
        this.refreshInterval = null;
      }

      ui.showLoginForm();
      ui.showSuccess('Logged out successfully');
    } catch (error) {
      console.error('Logout failed:', error);
      ui.showError('Error during logout');
    }
  }

  async handleProxyToggle(event) {
    try {
      await storage.set(STORAGE_KEYS.PROXY_ENABLED, event.target.checked);
      ui.showSuccess(`Proxy ${event.target.checked ? 'enabled' : 'disabled'}`);
    } catch (error) {
      console.error('Error toggling proxy:', error);
      ui.showError('Failed to toggle proxy');
      event.target.checked = !event.target.checked; // Revert the toggle
    }
  }

  async showAccountManager() {
    try {
      ui.showAccountManager();
      await this.loadAccounts();
      
      // Start auto-refresh if enabled
      if (UI_CONFIG.REFRESH_INTERVAL) {
        this.refreshInterval = setInterval(() => this.loadAccounts(), UI_CONFIG.REFRESH_INTERVAL);
      }
    } catch (error) {
      console.error('Error showing account manager:', error);
      ui.showError('Error loading account manager');
    }
  }

  async loadAccounts() {
    try {
      const token = await storage.get(STORAGE_KEYS.TOKEN);
      if (!token) {
        throw new Error('No authentication token found');
      }

      const response = await fetch(`${API_URL}/api/accounts`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to load accounts');
      }

      const accounts = await response.json();
      const currentAccount = await storage.get(STORAGE_KEYS.CURRENT_ACCOUNT);
      
      ui.updateAccountsList(accounts, currentAccount);
    } catch (error) {
      console.error('Failed to load accounts:', error);
      if (error.message.includes('authentication')) {
        await this.handleLogout();
      } else {
        ui.showError('Failed to load accounts. Please try again.');
      }
    }
  }
}

// Initialize popup
const popupManager = new PopupManager();
document.addEventListener('DOMContentLoaded', () => popupManager.init());

// Handle messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SESSION_EXPIRED') {
    ui.showError('Session expired. Please login again.');
    popupManager.handleLogout();
  }
  sendResponse({ received: true });
});