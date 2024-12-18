import { authService } from './services/authService.js';
import { accountService } from './services/accountService.js';
import { ui } from './utils/ui.js';

class PopupManager {
  constructor() {
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;
    
    this.attachEventListeners();
    await this.checkAuthState();
    this.initialized = true;
  }

  attachEventListeners() {
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.handleLogin();
      });
    }
    
    document.getElementById('logout-btn')?.addEventListener('click', () => this.handleLogout());
  }

  async checkAuthState() {
    const isAuthenticated = await authService.isAuthenticated();
    if (isAuthenticated) {
      await this.loadAccounts();
    } else {
      ui.showLoginForm();
    }
  }

  async handleLogin() {
    const email = document.getElementById('email')?.value;
    const password = document.getElementById('password')?.value;

    if (!email || !password) {
      ui.showError('Please enter email and password');
      return;
    }

    try {
      await authService.login(email, password);
      await this.loadAccounts();
      ui.showSuccess('Login successful');
    } catch (error) {
      console.error('Login failed:', error);
      ui.showError('Login failed. Please check your credentials.');
    }
  }

  async handleLogout() {
    try {
      await authService.logout();
      ui.showLoginForm();
      ui.showSuccess('Logged out successfully');
    } catch (error) {
      ui.showError('Error during logout');
    }
  }

  async loadAccounts() {
    try {
      ui.showAccountManager();
      const accounts = await accountService.getAccounts();
      const currentAccount = await accountService.getCurrentAccount();
      ui.updateAccountsList(accounts, currentAccount);
    } catch (error) {
      ui.showError('Failed to load accounts');
    }
  }
}

// Initialize popup
const popupManager = new PopupManager();
document.addEventListener('DOMContentLoaded', () => popupManager.init());