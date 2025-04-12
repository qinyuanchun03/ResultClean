// 全局变量
let enabled = true;
let rules = [];
let removedCount = 0;
let hideTimeout = null;
let counter = null;
let observer = null;

// 初始化
function init() {
  // 创建计数器元素
  createCounter();

  // 从存储中加载设置
  chrome.storage.local.get(['enabled', 'rules', 'totalFiltered'], function(data) {
    enabled = data.enabled !== false; // 默认为true

    // 如果存储中有规则，则使用存储中的规则，否则使用默认规则
    if (data.rules && data.rules.length > 0) {
      rules = data.rules;
    } else {
      // 从manifest.json中获取默认规则
      rules = getDefaultRules();
      // 保存到存储中
      chrome.storage.local.set({ rules: rules });
    }

    // 如果启用了过滤，则开始过滤
    if (enabled) {
      startFiltering();
    }
  });

  // 监听来自popup的消息
  chrome.runtime.onMessage.addListener(function(message) {
    if (message.action === 'toggleFilter') {
      enabled = message.enabled;
      if (enabled) {
        startFiltering();
      } else {
        stopFiltering();
      }
    } else if (message.action === 'updateRules') {
      rules = message.rules;
      if (enabled) {
        // 重新过滤
        removeSearchResults();
      }
    }
  });
}

// 创建计数器元素
function createCounter() {
  // 如果已存在计数器，则先移除
  if (counter) {
    counter.remove();
  }

  counter = document.createElement('div');
  counter.className = 'filter-counter';
  counter.style.display = 'none';
  document.body.appendChild(counter);
}

// 更新计数器
function updateCounter() {
  // 清除之前的超时
  if (hideTimeout) {
    clearTimeout(hideTimeout);
  }

  // 获取总结果数量
  let totalResults = 0;

  // 根据不同搜索引擎获取搜索结果
  if (window.location.hostname.includes('google.com')) {
    totalResults = document.querySelectorAll('.g').length;
  } else if (window.location.hostname.includes('bing.com')) {
    totalResults = document.querySelectorAll('.b_algo').length;
  } else if (window.location.hostname.includes('baidu.com')) {
    totalResults = document.querySelectorAll('.result').length;
  }

  // 获取累计屏蔽数量
  const totalFiltered = parseInt(localStorage.getItem('totalFiltered') || '0');

  // 更新计数器显示
  counter.textContent = `总搜索结果 ${totalResults} 条，已屏蔽 ${removedCount} 条。累计屏蔽 ${totalFiltered} 条`;

  // 显示计数器
  counter.style.display = 'block';
  // 使用requestAnimationFrame确保动画流畅
  requestAnimationFrame(() => {
    counter.classList.add('show');
  });

  // 3秒后淡出
  hideTimeout = setTimeout(() => {
    counter.classList.remove('show');
    // 等待淡出动画完成后隐藏元素
    setTimeout(() => {
      counter.style.display = 'none';
    }, 300);
  }, 3000);

  // 将统计信息保存到storage中，供弹出页面使用
  chrome.storage.local.set({
    totalResults: totalResults,
    currentFiltered: removedCount,
    totalFiltered: totalFiltered
  });
}

// 判断URL是否应该被过滤
function shouldFilter(url) {
  if (!url) return false;
  try {
    // 检查URL是否匹配任何规则
    return rules.some(rule => {
      // 处理泛域名规则，如 *.example.com/*
      if (rule.startsWith('*.') && rule.endsWith('/*')) {
        // 提取域名部分，去除 *. 和 /*
        const domain = rule.substring(2, rule.length - 2);
        // 创建正则表达式匹配任何子域名和任何路径
        const regex = new RegExp(`^(https?://)?([a-z0-9-]+\\.)*${domain.replace(/\./g, '\\.')}(\\/.*)?$`);
        return regex.test(url);
      }
      // 处理泛域名规则，如 *.example.com
      else if (rule.startsWith('*.')) {
        // 提取域名部分，去除 *.
        const domain = rule.substring(2);
        // 创建正则表达式匹配任何子域名
        const regex = new RegExp(`^(https?://)?([a-z0-9-]+\\.)*${domain.replace(/\./g, '\\.')}`);
        return regex.test(url);
      }
      // 处理域名通配符规则，如 example.com/*
      else if (rule.endsWith('/*')) {
        // 提取域名部分，去除 /*
        const domain = rule.substring(0, rule.length - 2);
        // 创建正则表达式匹配特定域名的任何路径
        const regex = new RegExp(`^(https?://)?([a-z0-9-]+\\.)*${domain.replace(/\./g, '\\.')}(\\/.*)?$`);
        return regex.test(url);
      }
      // 处理普通域名规则，如 example.com
      else {
        const regex = new RegExp(`^(https?://)?([a-z0-9-]+\\.)*${rule.replace(/\./g, '\\.')}`);
        return regex.test(url);
      }
    });
  } catch (error) {
    console.error('URL过滤错误:', error);
    return false;
  }
}

// 移除搜索结果
function removeSearchResults() {
  if (!enabled) return;

  let results = [];
  let hasChanges = false;

  // 根据不同搜索引擎获取搜索结果
  if (window.location.hostname.includes('google.com')) {
    results = document.querySelectorAll('.g:not([data-filtered="true"])');
  } else if (window.location.hostname.includes('bing.com')) {
    results = document.querySelectorAll('.b_algo:not([data-filtered="true"])');
  } else if (window.location.hostname.includes('baidu.com')) {
    results = document.querySelectorAll('.result:not([data-filtered="true"])');
  }

  // 如果没有新的结果需要处理，则直接返回
  if (results.length === 0) return;

  // 处理新的搜索结果
  results.forEach(div => {
    // 检查div及其子元素中的所有链接
    const links = div.querySelectorAll('a');
    let shouldRemove = false;

    // 快速检查链接
    for (let i = 0; i < links.length; i++) {
      if (shouldFilter(links[i].href)) {
        shouldRemove = true;
        break;
      }
    }

    // 如果链接检查没有命中，再检查文本内容
    if (!shouldRemove) {
      const text = div.textContent.toLowerCase();
      for (const rule of rules) {
        // 对于泛域名规则，只检查基本域名部分
        let domainToCheck = rule;
        if (rule.startsWith('*.')) {
          domainToCheck = rule.substring(2);
        }
        if (rule.endsWith('/*')) {
          domainToCheck = domainToCheck.substring(0, domainToCheck.length - 2);
        }

        if (text.includes(domainToCheck)) {
          shouldRemove = true;
          break;
        }
      }
    }

    // 标记元素为已处理
    div.setAttribute('data-filtered', 'true');

    // 如果需要移除
    if (shouldRemove) {
      // 找到最近的搜索结果容器
      const resultContainer = div.closest('.g, .b_algo, .result');
      if (resultContainer) {
        resultContainer.remove();
        removedCount++;
        hasChanges = true;

        // 更新累计屏蔽数量
        let totalFiltered = parseInt(localStorage.getItem('totalFiltered') || '0');
        totalFiltered++;
        localStorage.setItem('totalFiltered', totalFiltered.toString());
      }
    }
  });

  // 只有当有变化时才更新计数器
  if (hasChanges) {
    updateCounter();
  }
}

// 开始过滤
function startFiltering() {
  // 初始执行一次过滤
  removeSearchResults();

  // 创建观察器实例，使用节流函数减少调用频率
  observer = new MutationObserver(debounce((mutations) => {
    // 检查是否有相关变化
    const hasRelevantChanges = mutations.some(mutation => {
      // 检查是否有新添加的节点
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        return true;
      }
      return false;
    });

    if (hasRelevantChanges) {
      removeSearchResults();
    }
  }, 200)); // 200毫秒的节流时间

  // 配置观察器选项，只观察子节点变化
  const config = {
    childList: true,
    subtree: true
  };

  // 开始观察
  observer.observe(document.body, config);

  // 定期检查，但间隔更长，减少资源占用
  const checkInterval = setInterval(() => {
    if (document.visibilityState === 'visible') { // 只在页面可见时运行
      removeSearchResults();
    }
  }, 5000); // 5秒检查一次

  // 将定时器存储起来，以便停止时清除
  window._filterCheckInterval = checkInterval;
}

// 节流函数，减少函数调用频率
function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      func.apply(this, args);
    }, wait);
  };
}

// 停止过滤
function stopFiltering() {
  // 停止观察器
  if (observer) {
    observer.disconnect();
    observer = null;
  }

  // 清除定时器
  if (window._filterCheckInterval) {
    clearInterval(window._filterCheckInterval);
    window._filterCheckInterval = null;
  }

  // 清除淡出计时器
  if (hideTimeout) {
    clearTimeout(hideTimeout);
    hideTimeout = null;
  }

  // 隐藏计数器
  if (counter) {
    counter.style.display = 'none';
  }
}

// 获取默认规则
function getDefaultRules() {
  return ['csdn.net', 'zhihu.com', 'docin.com', 'doc88.com', '*.csdn.net/*', '*.zhihu.com/*'];
}

// 当页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init);

// 如果页面已经加载完成，则立即初始化
if (document.readyState === 'interactive' || document.readyState === 'complete') {
  init();
}
