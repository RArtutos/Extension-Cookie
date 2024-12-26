import { UI_CONFIG } from '../config/constants.js';
import { accountManager } from '../accountManager.js';

class UI {
  showLoginForm() {
    document.getElementById('login-form').classList.remove('hidden');
    document.getElementById('account-manager').classList.add('hidden');
  }

  showAccountManager() {
    document.getElementById('login-form').classList.add('hidden');
    document.getElementById('account-manager').classList.remove('hidden');
  }

  updateAccountsList(accounts, currentAccount) {
    const accountsList = document.getElementById('accounts-list');
    accountsList.innerHTML = accounts.map(account => {
      const isActive = currentAccount && currentAccount.id === account.id;
      const isDisabled = account.active_users >= account.max_concurrent_users && !isActive;
      
      // Crear el contenido del icono
      let iconContent;
      if (account.image_url) {
        iconContent = `<img src="${account.image_url}" alt="${account.name}" class="account-icon">`;
      } else {
        // Si no hay imagen, usar la primera letra del nombre como icono
        const initial = account.name.charAt(0).toUpperCase();
        iconContent = `<div class="account-icon default">${initial}</div>`;
      }
      
      return `
        <div class="account-item ${isActive ? 'active' : ''} ${isDisabled ? 'disabled' : ''}">
          <div class="account-info">
            ${iconContent}
            <div class="account-details">
              <div class="account-name">${account.name}</div>
              ${account.group ? `<div class="account-group">${account.group}</div>` : ''}
              <div class="session-info">
                ${account.active_users}/${account.max_concurrent_users} users
              </div>
            </div>
          </div>
          <button class="switch-btn" 
                  data-account='${JSON.stringify(account)}'
                  ${isDisabled ? 'disabled' : ''}>
            ${isActive ? 'Current' : 'Switch'}
          </button>
        </div>
      `;
    }).join('');

    this.attachSwitchButtonListeners();
  }

  showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    document.getElementById('app').prepend(errorDiv);
    setTimeout(() => errorDiv.remove(), UI_CONFIG.ERROR_TIMEOUT);
  }

  showSuccess(message) {
    const successDiv = document.createElement('div');
    successDiv.className = 'success-message';
    successDiv.textContent = message;
    document.getElementById('app').prepend(successDiv);
    setTimeout(() => successDiv.remove(), UI_CONFIG.SUCCESS_TIMEOUT);
  }

  attachSwitchButtonListeners() {
    document.querySelectorAll('.switch-btn').forEach(button => {
      button.addEventListener('click', async (e) => {
        const account = JSON.parse(e.target.dataset.account);
        try {
          await accountManager.switchAccount(account);
        } catch (error) {
          this.showError(error.message);
        }
      });
    });
  }
}

export const ui = new UI();