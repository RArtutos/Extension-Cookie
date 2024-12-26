import { accountService } from './services/accountService.js';
import { sessionService } from './services/sessionService.js';
import { cookieManager } from './utils/cookie/cookieManager.js';
import { analyticsService } from './services/analyticsService.js';
import { ui } from './utils/ui.js';
import { storage } from './utils/storage.js';

class AccountManager {
  constructor() {
    this.currentAccount = null;
  }

  async switchAccount(account) {
    try {
      const currentAccount = await storage.get('currentAccount');
      
      // Si hay una cuenta actual, finalizar su sesión
      if (currentAccount) {
        await sessionService.endSession(currentAccount.id, this.getDomain(currentAccount));
      }

      // Iniciar nueva sesión
      await sessionService.startSession(account.id, this.getDomain(account));

      // Establecer cookies con verificación
      const cookiesSet = await cookieManager.setAccountCookies(account);
      
      if (!cookiesSet) {
        // Reintentar una vez más si falló
        console.log('Retrying cookie setup...');
        const retrySuccess = await cookieManager.setAccountCookies(account);
        if (!retrySuccess) {
          throw new Error('Failed to set cookies after retry');
        }
      }

      // Actualizar storage
      await storage.set('currentAccount', account);
      this.currentAccount = account;

      // Abrir dominio en nueva pestaña
      const domain = this.getDomain(account);
      chrome.tabs.create({ url: `https://${domain}` });

      ui.showSuccess('Account switched successfully');

      // Actualizar lista de cuentas
      const accounts = await accountService.getAccounts();
      ui.updateAccountsList(accounts, account);

    } catch (error) {
      console.error('Error switching account:', error);
      ui.showError(error.message);
      throw error;
    }
  }

  getDomain(account) {
    if (!account?.cookies?.length) return '';
    const domain = account.cookies[0].domain;
    return domain.startsWith('.') ? domain.substring(1) : domain;
  }

  async cleanupCurrentSession() {
    try {
      const currentAccount = await storage.get('currentAccount');
      if (currentAccount) {
        await sessionService.endSession(currentAccount.id, this.getDomain(currentAccount));
        await cookieManager.removeAccountCookies(currentAccount);
      }
      await storage.remove('currentAccount');
      this.currentAccount = null;
    } catch (error) {
      console.error('Error cleaning up session:', error);
    }
  }
}

export const accountManager = new AccountManager();