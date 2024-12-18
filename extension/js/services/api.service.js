import { API_URL, CORS_CONFIG } from '../config.js';
import { storage } from '../utils/storage.js';
import { STORAGE_KEYS } from '../config.js';

class ApiService {
    constructor() {
        this.baseUrl = API_URL;
    }

    async getHeaders() {
        const token = await storage.get(STORAGE_KEYS.TOKEN);
        return {
            ...CORS_CONFIG.headers,
            'Authorization': token ? `Bearer ${token}` : ''
        };
    }

    async validateToken(token) {
        try {
            const response = await fetch(`${this.baseUrl}/api/auth/validate`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    ...CORS_CONFIG.headers
                },
                credentials: CORS_CONFIG.credentials
            });
            
            if (!response.ok) {
                throw new Error('Invalid token');
            }
            
            return await response.json();
        } catch (error) {
            console.error('Token validation failed:', error);
            return null;
        }
    }

    async login(email, password) {
        try {
            const response = await fetch(`${this.baseUrl}/api/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    ...CORS_CONFIG.headers
                },
                credentials: CORS_CONFIG.credentials,
                body: `username=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`
            });

            if (!response.ok) {
                throw new Error('Login failed');
            }

            const data = await response.json();
            if (!data.access_token) {
                throw new Error('Invalid response from server');
            }

            await storage.set(STORAGE_KEYS.TOKEN, data.access_token);
            return data;
        } catch (error) {
            console.error('Login error:', error);
            throw error;
        }
    }

    async getAccounts() {
        try {
            const headers = await this.getHeaders();
            const response = await fetch(`${this.baseUrl}/api/accounts`, {
                headers,
                credentials: CORS_CONFIG.credentials
            });

            if (!response.ok) {
                if (response.status === 401) {
                    await storage.remove(STORAGE_KEYS.TOKEN);
                }
                throw new Error('Failed to fetch accounts');
            }

            return await response.json();
        } catch (error) {
            console.error('Error fetching accounts:', error);
            throw error;
        }
    }
}

export const apiService = new ApiService();