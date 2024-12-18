import { httpClient } from '../utils/httpClient.js';
import { storage } from '../utils/storage.js';
import { STORAGE_KEYS } from '../config/constants.js';

class AccountService {
  async getCurrentAccount() {
    return await storage.get(STORAGE_KEYS.CURRENT_ACCOUNT);
  }

  async getAccounts() {
    try {
      const response = await httpClient.get('/api/accounts/');
      return response || [];
    } catch (error) {
      console.error('Error fetching accounts:', error);
      throw new Error('Failed to fetch accounts');
    }
  }

  async switchAccount(account) {
    try {
      // Verify session limits
      const sessionInfo = await this.getSessionInfo(account.id);
      if (sessionInfo.active_sessions >= sessionInfo.max_concurrent_users) {
        throw new Error(`Maximum concurrent users (${sessionInfo.max_concurrent_users}) reached`);
      }

      await storage.set(STORAGE_KEYS.CURRENT_ACCOUNT, account);
      return true;
    } catch (error) {
      console.error('Error switching account:', error);
      throw error;
    }
  }

  async getSessionInfo(accountId) {
    try {
      const response = await httpClient.get(`/api/accounts/${accountId}/session`);
      return response || { active_sessions: 0, max_concurrent_users: 1 };
    } catch (error) {
      console.error('Error getting session info:', error);
      throw new Error('Failed to get session information');
    }
  }
}

export const accountService = new AccountService();