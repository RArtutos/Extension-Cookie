import { SESSION_CONFIG } from '../config/constants.js';
import { storage } from '../utils/storage.js';
import { httpClient } from '../utils/httpClient.js';
import { cookieManager } from '../utils/cookie/cookieManager.js';
import { analyticsService } from './analyticsService.js';

class SessionManager {
  constructor() {
    this.activeTimers = new Map();
    this.pollInterval = null;
    this.initializeSessionCleanup();
  }

  initializeSessionCleanup() {
    // Limpiar sesiones al cerrar el navegador
    chrome.runtime.onSuspend.addListener(() => {
      this.cleanupCurrentSession();
    });

    // Monitorear cambios de pestañas para detectar salida del dominio
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.url) {
        this.handleDomainChange(new URL(changeInfo.url).hostname);
      }
    });
  }

  async startPolling() {
    if (this.pollInterval) return;
    
    this.pollInterval = setInterval(async () => {
      const currentAccount = await storage.get('currentAccount');
      if (currentAccount) {
        await this.updateSessionStatus(currentAccount.id);
      }
    }, SESSION_CONFIG.REFRESH_INTERVAL);
  }

  stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  async updateSessionStatus(accountId) {
    try {
      const response = await httpClient.get(`/api/accounts/${accountId}/session`);
      const currentAccount = await storage.get('currentAccount');
      
      if (response.active_sessions >= response.max_concurrent_users && 
          (!currentAccount || currentAccount.id !== accountId)) {
        await this.cleanupCurrentSession();
        throw new Error('Session limit reached');
      }
      
      return response;
    } catch (error) {
      console.error('Error updating session status:', error);
      throw error;
    }
  }

  async handleDomainChange(newDomain) {
    const currentAccount = await storage.get('currentAccount');
    if (!currentAccount) return;

    const accountDomain = this.getAccountDomain(currentAccount);
    if (!newDomain.includes(accountDomain)) {
      await this.cleanupCurrentSession();
    }
  }

  getAccountDomain(account) {
    if (!account?.cookies?.length) return '';
    const domain = account.cookies[0].domain;
    return domain.startsWith('.') ? domain.substring(1) : domain;
  }

  async cleanupCurrentSession() {
    try {
      const currentAccount = await storage.get('currentAccount');
      if (!currentAccount) return;

      // Limpiar cookies
      await cookieManager.removeAccountCookies(currentAccount);
      
      // Finalizar sesión en el backend
      await this.endSession(currentAccount.id);
      
      // Limpiar storage
      await storage.remove('currentAccount');
      
      // Detener polling
      this.stopPolling();
      
      // Limpiar timers
      this.clearAllTimers();
    } catch (error) {
      console.error('Error cleaning up session:', error);
    }
  }

  clearAllTimers() {
    this.activeTimers.forEach(timer => clearTimeout(timer));
    this.activeTimers.clear();
  }

  async startSession(accountId, domain) {
    try {
      const sessionInfo = await this.updateSessionStatus(accountId);
      if (sessionInfo.active_sessions >= sessionInfo.max_concurrent_users) {
        throw new Error('Maximum concurrent users reached');
      }

      await analyticsService.trackSessionStart(accountId, domain);
      this.startPolling();
      return true;
    } catch (error) {
      console.error('Error starting session:', error);
      throw error;
    }
  }

  async endSession(accountId) {
    try {
      const currentAccount = await storage.get('currentAccount');
      if (currentAccount?.id === accountId) {
        const domain = this.getAccountDomain(currentAccount);
        await analyticsService.trackSessionEnd(accountId, domain);
        this.stopPolling();
      }
      return true;
    } catch (error) {
      console.error('Error ending session:', error);
      return false;
    }
  }
}

export const sessionManager = new SessionManager();