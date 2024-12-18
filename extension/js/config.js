// API configuration
export const API_URL = 'https://api.artutos.us.kg';  // Update this to match your backend URL

// Session configuration
export const SESSION_CONFIG = {
  INACTIVITY_TIMEOUT: 60000, // 1 minute in milliseconds
  MAX_CONCURRENT_SESSIONS: 3,
  REFRESH_INTERVAL: 30000 // 30 seconds
};

// UI configuration
export const UI_CONFIG = {
  ERROR_TIMEOUT: 5000,
  SUCCESS_TIMEOUT: 3000
};

// Storage keys
export const STORAGE_KEYS = {
  TOKEN: 'token',
  CURRENT_ACCOUNT: 'currentAccount',
  USER_DATA: 'userData'
};

// Analytics configuration
export const ANALYTICS_CONFIG = {
  TRACKING_INTERVAL: 60000, // 1 minute
  BATCH_SIZE: 10
};

// CORS configuration
export const CORS_CONFIG = {
  credentials: true,
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  }
};