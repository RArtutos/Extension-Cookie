// Manejo del almacenamiento local
export const storage = {
  get: (key) => {
    return new Promise((resolve) => {
      chrome.storage.local.get([key], (result) => resolve(result[key]));
    });
  },

  set: (key, value) => {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [key]: value }, resolve);
    });
  },

  remove: (keys) => {
    return new Promise((resolve) => {
      chrome.storage.local.remove(keys, resolve);
    });
  }
};