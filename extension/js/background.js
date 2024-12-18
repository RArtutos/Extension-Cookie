import { analyticsService } from './services/analyticsService.js';

// Track tab activity
chrome.tabs.onActivated.addListener(async (activeInfo) => {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab.url) {
        const domain = new URL(tab.url).hostname;
        analyticsService.resetTimer(domain);
    }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url) {
        const domain = new URL(changeInfo.url).hostname;
        analyticsService.resetTimer(domain);
    }
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'GET_CURRENT_ACCOUNT') {
        chrome.storage.local.get(['currentAccount'], result => {
            sendResponse(result.currentAccount);
        });
        return true;
    }
});

// Handle proxy settings
chrome.proxy.settings.onChange.addListener((details) => {
    console.log('Proxy settings changed:', details);
});

chrome.proxy.onProxyError.addListener((details) => {
    console.error('Proxy error:', details);
});