// 全局变量
let enabled = true;
let rules = [];
let removedCount = 0;
let hideTimeout = null;
let counter = null;
let observer = null;
let searchEngine = '';
let resultSelector = '';

// 初始化
function init() {
  // 确定当前搜索引擎和对应的选择器
  if (window.location.hostname.includes('google.com')) {
    searchEngine = 'google';
    resultSelector = '.g';
  } else if (window.location.hostname.includes('bing.com')) {
    searchEngine = 'bing';
    resultSelector = '.b_algo';
  } else if (window.location.hostname.includes('baidu.com')) {
    searchEngine = 'baidu';
    resultSelector = '.result';
  }

  // 创建计数器元素
  createCounter();

  // 从存储中加载设置
  chrome.storage.local.get(['enabled', 'rules', 'totalFiltered'], function(data) {
    enabled = data.enabled !== false; // 默认为true
    rules = data.rules && data.rules.length > 0 ? data.rules : getDefaultRules();
    
    // 预编译规则正则表达式
    rules = compileRules(rules);

    if (enabled) {
      startFiltering();
    }
  });

  // 使用事件委托监听消息
  chrome.runtime.onMessage.addListener(handleMessage);
}

// 预编译规则正则表达式
function compileRules(rawRules) {
  return rawRules.map(rule => {
    let pattern;
    if (rule.startsWith('*.') && rule.endsWith('/*')) {
      const domain = rule.substring(2, rule.length - 2);
      pattern = `^(https?://)?([a-z0-9-]+\\.)*${domain.replace(/\./g, '\\.')}(\\/.*)?$`;
    } else if (rule.startsWith('*.')) {
      const domain = rule.substring(2);
      pattern = `^(https?://)?([a-z0-9-]+\\.)*${domain.replace(/\./g, '\\.')}`;
    } else if (rule.endsWith('/*')) {
      const domain = rule.substring(0, rule.length - 2);
      pattern = `^(https?://)?([a-z0-9-]+\\.)*${domain.replace(/\./g, '\\.')}(\\/.*)?$`;
    } else {
      pattern = `^(https?://)?([a-z0-9-]+\\.)*${rule.replace(/\./g, '\\.')}`;
    }
    return {
      original: rule,
      regex: new RegExp(pattern),
      domain: rule.replace(/^\*\.|\/*$/g, '')
    };
  });
}

// 处理消息
function handleMessage(message) {
  if (message.action === 'toggleFilter') {
    enabled = message.enabled;
    enabled ? startFiltering() : stopFiltering();
  } else if (message.action === 'updateRules') {
    rules = compileRules(message.rules);
    enabled && removeSearchResults();
  }
}

// 创建计数器元素
function createCounter() {
  if (counter) counter.remove();
  
  counter = document.createElement('div');
  counter.className = 'filter-counter';
  counter.style.display = 'none';
  document.body.appendChild(counter);
}

// 更新计数器（使用requestAnimationFrame优化）
function updateCounter() {
  if (hideTimeout) clearTimeout(hideTimeout);

  const totalResults = document.querySelectorAll(resultSelector).length;
  const totalFiltered = parseInt(localStorage.getItem('totalFiltered') || '0');

  requestAnimationFrame(() => {
    counter.textContent = `总搜索结果 ${totalResults} 条，已屏蔽 ${removedCount} 条。累计屏蔽 ${totalFiltered} 条`;
    counter.style.display = 'block';
    counter.classList.add('show');
  });

  hideTimeout = setTimeout(() => {
    counter.classList.remove('show');
    setTimeout(() => counter.style.display = 'none', 300);
  }, 3000);

  // 批量更新存储
  chrome.storage.local.set({
    totalResults,
    currentFiltered: removedCount,
    totalFiltered
  });
}

// 判断URL是否应该被过滤（使用预编译的正则表达式）
function shouldFilter(url) {
  if (!url) return false;
  try {
    return rules.some(rule => 
      rule.regex.test(url) || url.toLowerCase().includes(rule.domain)
    );
  } catch (error) {
    console.error('URL过滤错误:', error);
    return false;
  }
}

// 移除搜索结果（使用DocumentFragment优化）
function removeSearchResults() {
  if (!enabled) return;

  const results = document.querySelectorAll(`${resultSelector}:not([data-filtered="true"])`);
  if (results.length === 0) return;

  let hasChanges = false;
  const fragment = document.createDocumentFragment();
  const toRemove = [];

  results.forEach(div => {
    div.setAttribute('data-filtered', 'true');
    
    // 使用缓存的选择器
    const links = div.getElementsByTagName('a');
    let shouldRemove = false;

    // 快速检查链接
    for (const link of links) {
      if (shouldFilter(link.href)) {
        shouldRemove = true;
        break;
      }
    }

    // 如果需要移除
    if (shouldRemove) {
      toRemove.push(div);
      removedCount++;
      hasChanges = true;

      // 更新累计屏蔽数量（批量更新）
      const totalFiltered = parseInt(localStorage.getItem('totalFiltered') || '0') + 1;
      localStorage.setItem('totalFiltered', totalFiltered.toString());
    } else {
      fragment.appendChild(div.cloneNode(true));
    }
  });

  // 批量移除元素
  toRemove.forEach(el => el.remove());

  // 只在有变化时更新计数器
  if (hasChanges) {
    updateCounter();
  }
}

// 开始过滤
function startFiltering() {
  removeSearchResults();

  // 优化MutationObserver配置
  const config = {
    childList: true,
    subtree: true
  };

  observer = new MutationObserver(debounce((mutations) => {
    const hasRelevantChanges = mutations.some(mutation => 
      mutation.type === 'childList' && mutation.addedNodes.length > 0
    );
    
    if (hasRelevantChanges) {
      removeSearchResults();
    }
  }, 100));

  observer.observe(document.body, config);
}

// 防抖函数（保持不变）
function debounce(func, wait = 250) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

// 停止过滤
function stopFiltering() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
}

// 获取默认规则
function getDefaultRules() {
  return [
    "csdn.net",
    "zhihu.com",
    "docin.com",
    "doc88.com",
    "*.csdn.net/*",
    "*.zhihu.com/*"
  ];
}

// 初始化
init();
