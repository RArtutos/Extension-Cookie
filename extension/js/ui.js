export const ui = {
  showLoginForm() {
    document.getElementById('login-form').classList.remove('hidden');
    document.getElementById('account-manager').classList.add('hidden');
  },

  showAccountManager() {
    document.getElementById('login-form').classList.add('hidden');
    document.getElementById('account-manager').classList.remove('hidden');
  },

  updateAccountsList(accounts, currentAccount) {
    const accountsList = document.getElementById('accounts-list');
    accountsList.innerHTML = accounts.map(account => {
      const isActive = currentAccount && currentAccount.name === account.name;
      return `
        <div class="account-item ${isActive ? 'active' : ''}">
          <span>${account.name}</span>
          <button class="switch-btn" data-account='${JSON.stringify(account)}'>Switch</button>
        </div>
      `;
    }).join('');

    // Agregar event listeners a los botones después de actualizar el HTML
    this.attachSwitchButtonListeners();
  },

  attachSwitchButtonListeners() {
    document.querySelectorAll('.switch-btn').forEach(button => {
      button.addEventListener('click', async (e) => {
        const account = JSON.parse(e.target.dataset.account);
        // Importamos dinámicamente para evitar dependencias circulares
        const { accountManager } = await import('./accountManager.js');
        accountManager.switchAccount(account);
      });
    });
  },

  showError(message) {
    alert(message);
  },

  showSuccess(message) {
    alert(message);
  }
};