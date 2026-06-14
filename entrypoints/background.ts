export default defineBackground(() => {
  console.log('ScamShield background script loaded');
  const LAST_ANALYSIS_KEY_PREFIX = 'scamShieldLastAnalysis_';

  browser.runtime.onMessage.addListener((message: any, sender, sendResponse) => {
    const handleMessage = async () => {
      if (message.action === 'cacheAnalysisResult') {
        const tabId = sender.tab?.id;
        if (tabId && message.data) {
          const key = `${LAST_ANALYSIS_KEY_PREFIX}${tabId}`;
          await browser.storage.local.set({ [key]: message.data });
          console.log(`Cached analysis for tab ${tabId}`, message.data);
        }
      }

      if (message.action === 'getStatusPopup') {
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        if (tabs.length > 0 && tabs[0].id) {
          const key = `${LAST_ANALYSIS_KEY_PREFIX}${tabs[0].id}`;
          const data = await browser.storage.local.get(key);
          return data[key] || null; 
        }
      }
    };

    handleMessage().then(response => {
      if (typeof response !== 'undefined') sendResponse(response);
    });

    return true;
  });

  browser.tabs.onRemoved.addListener((tabId) => {
      const key = `${LAST_ANALYSIS_KEY_PREFIX}${tabId}`;
      browser.storage.local.remove(key);
  });
});
