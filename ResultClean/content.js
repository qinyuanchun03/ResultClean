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
  chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
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
  counter = document.createElement('div');
  counter.className = 'filter-counter';
  counter.style.opacity = '0';
  counter.style.display = 'none';
  document.body.appendChild(counter);
}

// 更新计数器
function updateCounter() {
  // 清除之前的超时
  if (hideTimeout) {
    clearTimeout(hideTimeout);
  }

  counter.style.opacity = '1';
  counter.style.display = 'block';

  // 从存储中获取统计信息
  chrome.storage.local.get(['totalResults', 'matchedResults', 'currentFiltered', 'totalFiltered'], function(data) {
    const totalResults = data.totalResults || 0;
    const matchedResults = data.matchedResults || 0;
    const currentFiltered = data.currentFiltered || 0;
    const totalFiltered = data.totalFiltered || 0;

    // 更新计数器显示
    counter.textContent = `总搜索结果 ${totalResults} 条，符合规则 ${matchedResults} 条，已屏蔽 ${currentFiltered} 条。累计屏蔽 ${totalFiltered} 条`;

    // 3秒后淡出
    hideTimeout = setTimeout(() => {
      counter.style.opacity = '0';
      // 等待淡出动画完成后隐藏元素
      setTimeout(() => {
        counter.style.display = 'none';
      }, 300);
    }, 3000);
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

  // 根据不同搜索引擎获取搜索结果
  if (window.location.hostname.includes('google.com')) {
    results = document.querySelectorAll('.g');
  } else if (window.location.hostname.includes('bing.com')) {
    results = document.querySelectorAll('.b_algo');
  } else if (window.location.hostname.includes('baidu.com')) {
    results = document.querySelectorAll('.result');
  }

  // 重置已移除计数
  removedCount = 0;

  // 统计符合规则的结果数量
  let matchedResults = 0;

  results.forEach(div => {
    // 检查div及其子元素中的所有链接
    const links = div.querySelectorAll('a');
    let shouldRemove = false;

    links.forEach(link => {
      if (shouldFilter(link.href)) {
        shouldRemove = true;
      }
    });

    // 如果div本身包含目标文本也移除
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

    // 统计符合规则的结果数量
    if (shouldRemove) {
      matchedResults++;

      // 找到最近的搜索结果容器
      const resultContainer = div.closest('.g, .b_algo, .result');
      if (resultContainer && !resultContainer.hasBeenRemoved) {
        resultContainer.hasBeenRemoved = true; // 标记以防重复计数
        resultContainer.remove();
        removedCount++;

        // 更新累计屏蔽数量
        let totalFiltered = parseInt(localStorage.getItem('totalFiltered') || '0');
        totalFiltered++;
        localStorage.setItem('totalFiltered', totalFiltered.toString());
      }
    }
  });

  // 更新统计信息
  const totalFiltered = parseInt(localStorage.getItem('totalFiltered') || '0');

  // 将统计信息保存到storage中，供弹出页面使用
  chrome.storage.local.set({
    totalResults: results.length,
    matchedResults: matchedResults,
    currentFiltered: removedCount,
    totalFiltered: totalFiltered
  });

  // 更新计数器显示
  updateCounter();
}

// 开始过滤
function startFiltering() {
  // 初始执行一次过滤
  removeSearchResults();

  // 创建观察器实例
  observer = new MutationObserver((mutations) => {
    removeSearchResults();
  });

  // 配置观察器选项
  const config = {
    childList: true,
    subtree: true
  };

  // 开始观察
  observer.observe(document.body, config);

  // 定期检查，以防漏掉一些动态加载的内容
  setInterval(removeSearchResults, 3000);
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
  return ['csdn.net', 'zhihu.com', 'docin.com', 'doc88.com', '*.csdn.net/*', '*.zhihu.com/*'];
}

// 当页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init);

// 如果页面已经加载完成，则立即初始化
if (document.readyState === 'interactive' || document.readyState === 'complete') {
  init();
}
