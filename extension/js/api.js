import { API_URL } from './config.js';

export const api = {
  login: async (email, password) => {
    const response = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `username=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`,
    });
    return response.json();
  },

  getAccounts: async (token) => {
    const response = await fetch(`${API_URL}/api/accounts`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    return response.json();
  }
};