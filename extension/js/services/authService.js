import { API_URL } from '../config/constants.js';
import { storage } from '../utils/storage.js';
import { STORAGE_KEYS } from '../config/constants.js';

class AuthService {
  constructor() {
    this.validationInterval = 60000;
    this.validationTimer = null;
    this.isLoggingOut = false;
    this.startValidationCheck();
  }

  async startValidationCheck() {
    if (this.validationTimer) {
      clearInterval(this.validationTimer);
    }

    this.validationTimer = setInterval(async () => {
      await this.validateUserStatus();
    }, this.validationInterval);
  }

  async validateUserStatus() {
    const token = await this.getToken();
    if (!token) return;

    try {
      const response = await fetch(`${API_URL}/api/auth/validate`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        await this.cleanup();
      }
    } catch (error) {
      console.error('Error validating user status:', error);
      await this.cleanup();
    }
  }

  async cleanup() {
    await this.logout();
    chrome.runtime.sendMessage({ type: 'SESSION_EXPIRED' });
  }

  async login(email, password) {
    try {
      const formData = new URLSearchParams();
      formData.append('username', email);
      formData.append('password', password);

      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString()
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Invalid credentials');
      }

      const data = await response.json();
      if (!data.access_token) {
        throw new Error('Invalid response from server');
      }

      await storage.set(STORAGE_KEYS.TOKEN, data.access_token);
      await storage.set(STORAGE_KEYS.EMAIL, email);
      
      this.startValidationCheck();
      
      return data;
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  }

  async logout() {
    if (this.isLoggingOut) return;
    
    try {
      this.isLoggingOut = true;

      const token = await this.getToken();
      const email = await this.getEmail();
      const currentAccount = await storage.get(STORAGE_KEYS.CURRENT_ACCOUNT);

      if (currentAccount?.cookies?.length && email && token) {
        const processedDomains = new Set();
        
        for (const cookie of currentAccount.cookies) {
          const domain = this.getDomain(cookie.domain);
          
          if (domain && !processedDomains.has(domain)) {
            processedDomains.add(domain);
            
            try {
              const response = await fetch(
                `${API_URL}/delete/sessions?email=${encodeURIComponent(email)}&domain=${encodeURIComponent(domain)}`,
                {
                  method: 'DELETE',
                  headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                  }
                }
              );

              if (!response.ok) {
                console.error(`Error in DELETE request for domain ${domain}:`, response.status);
              }
            } catch (error) {
              console.error(`Error sending DELETE request for domain ${domain}:`, error);
            }
          }
        }
      }

      // Limpiar cookies después de los DELETE requests
      chrome.runtime.sendMessage({ type: 'CLEANUP_COOKIES' });
      
      // Esperar un momento para asegurar que las cookies se limpien
      await new Promise(resolve => setTimeout(resolve, 500));

      // Llamar al endpoint de logout antes de limpiar el storage
      try {
        const response = await fetch(`${API_URL}/api/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          console.error('Error in logout request:', response.status);
        }
      } catch (error) {
        console.error('Error sending logout request:', error);
      }
      
      // Limpiar storage después de todo
      await storage.remove(STORAGE_KEYS.TOKEN);
      await storage.remove(STORAGE_KEYS.CURRENT_ACCOUNT);
      await storage.remove(STORAGE_KEYS.EMAIL);
      await storage.remove(STORAGE_KEYS.USER_SETTINGS);
      
      if (this.validationTimer) {
        clearInterval(this.validationTimer);
        this.validationTimer = null;
      }

      return true;
    } catch (error) {
      console.error('Logout error:', error);
      throw error;
    } finally {
      this.isLoggingOut = false;
    }
  }

  getDomain(domain) {
    if (!domain) return '';
    return domain.startsWith('.') ? domain.substring(1) : domain;
  }

  async getToken() {
    return await storage.get(STORAGE_KEYS.TOKEN);
  }

  async getEmail() {
    return await storage.get(STORAGE_KEYS.EMAIL);
  }

  async isAuthenticated() {
    const token = await this.getToken();
    if (!token) return false;

    try {
      const response = await fetch(`${API_URL}/api/auth/validate`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  setValidationInterval(interval) {
    this.validationInterval = interval;
    this.startValidationCheck();
  }
}

export const authService = new AuthService();