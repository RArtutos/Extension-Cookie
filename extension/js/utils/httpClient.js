import { API_URL } from '../config/constants.js';
import { storage } from './storage.js';
import { STORAGE_KEYS } from '../config/constants.js';

class HttpClient {
  async getHeaders() {
    const token = await storage.get(STORAGE_KEYS.TOKEN);
    return {
      'Authorization': token ? `Bearer ${token}` : '',
      'Content-Type': 'application/json'
    };
  }

  async handleResponse(response) {
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || 'Request failed');
      }
      return data;
    } else {
      const text = await response.text();
      if (!response.ok) {
        throw new Error(text || 'Request failed');
      }
      return text;
    }
  }

  async get(endpoint) {
    try {
      const headers = await this.getHeaders();
      const response = await fetch(`${API_URL}${endpoint}`, { headers });
      return await this.handleResponse(response);
    } catch (error) {
      console.error('GET request failed:', error);
      if (error.message.includes('401') || error.message.includes('403')) {
        await storage.remove(STORAGE_KEYS.TOKEN);
      }
      throw error;
    }
  }

  async post(endpoint, data = {}) {
    try {
      const headers = await this.getHeaders();
      const response = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(data)
      });
      return await this.handleResponse(response);
    } catch (error) {
      console.error('POST request failed:', error);
      if (error.message.includes('401') || error.message.includes('403')) {
        await storage.remove(STORAGE_KEYS.TOKEN);
      }
      throw error;
    }
  }

  async delete(endpoint) {
    try {
      const headers = await this.getHeaders();
      const response = await fetch(`${API_URL}${endpoint}`, {
        method: 'DELETE',
        headers
      });
      return await this.handleResponse(response);
    } catch (error) {
      console.error('DELETE request failed:', error);
      if (error.message.includes('401') || error.message.includes('403')) {
        await storage.remove(STORAGE_KEYS.TOKEN);
      }
      throw error;
    }
  }
}

export const httpClient = new HttpClient();