import { httpClient } from '../utils/httpClient.js';
import { storage } from '../utils/storage.js';
import { SESSION_CONFIG } from '../config/constants.js';
import { analyticsService } from './analyticsService.js';

class SessionService {
  constructor() {
    this.activeTimers = new Map();
  }

  async startSession(accountId, domain) {
    try {
      // Incrementar usuarios activos
      await httpClient.post(`/api/accounts/${accountId}/active`);
      
      // Crear sesión
      await httpClient.post('/api/sessions', {
        account_id: accountId,
        domain: domain
      });

      // Track session start
      await analyticsService.trackSessionStart(accountId, domain);
      this.startInactivityTimer(domain, accountId);
      return true;
    } catch (error) {
      console.error('Error starting session:', error);
      throw error;
    }
  }

  async endSession(accountId, domain) {
    try {
      // Decrementar usuarios activos
      await httpClient.delete(`/api/accounts/${accountId}/active`);
      
      // Finalizar sesión
      await httpClient.delete(`/api/sessions/${accountId}`);
      
      await analyticsService.trackSessionEnd(accountId, domain);
      this.clearInactivityTimer(domain);
      return true;
    } catch (error) {
      console.error('Error ending session:', error);
      return false;
    }
  }

  async getSessionInfo(accountId) {
    try {
      return await httpClient.get(`/api/accounts/${accountId}/session`);
    } catch (error) {
      console.error('Error getting session info:', error);
      throw error;
    }
  }

  startInactivityTimer(domain, accountId) {
    this.clearInactivityTimer(domain);
    const timer = setTimeout(
      () => this.handleInactivity(domain, accountId),
      SESSION_CONFIG.INACTIVITY_TIMEOUT
    );
    this.activeTimers.set(domain, timer);
  }

  clearInactivityTimer(domain) {
    if (this.activeTimers.has(domain)) {
      clearTimeout(this.activeTimers.get(domain));
      this.activeTimers.delete(domain);
    }
  }

  async handleInactivity(domain, accountId) {
    this.clearInactivityTimer(domain);
    await this.endSession(accountId, domain);
  }
}

export const sessionService = new SessionService();