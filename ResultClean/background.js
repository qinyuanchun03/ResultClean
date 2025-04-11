// 扩展程序安装或更新时初始化设置
chrome.runtime.onInstalled.addListener(function(details) {
  if (details.reason === 'install') {
    // 初始化设置
    chrome.storage.local.set({
      enabled: true,
      rules: ['csdn.net', 'zhihu.com', 'docin.com', 'doc88.com', '*.csdn.net/*', '*.zhihu.com/*'],
      currentFiltered: 0,
      totalFiltered: 0
    });
  } else if (details.reason === 'update') {
    // 更新时保留用户设置，但确保规则列表包含默认规则
    chrome.storage.local.get(['rules'], function(data) {
      const defaultRules = ['csdn.net', 'zhihu.com', 'docin.com', 'doc88.com', '*.csdn.net/*', '*.zhihu.com/*'];
      let rules = data.rules || [];

      // 确保默认规则存在
      defaultRules.forEach(rule => {
        if (!rules.includes(rule)) {
          rules.push(rule);
        }
      });

      chrome.storage.local.set({ rules: rules });
    });
  }
});

// 当用户打开新的搜索页面时重置当前过滤计数
chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
  if (changeInfo.status === 'complete' &&
      (tab.url.includes('google.com/search') ||
       tab.url.includes('bing.com/search') ||
       tab.url.includes('baidu.com/s'))) {
    chrome.storage.local.set({ currentFiltered: 0 });
  }
});
