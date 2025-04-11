document.addEventListener('DOMContentLoaded', function() {
  // 获取DOM元素
  const enableFilterCheckbox = document.getElementById('enableFilter');
  const totalResultsElement = document.getElementById('totalResults');
  const matchedResultsElement = document.getElementById('matchedResults');
  const currentFilteredElement = document.getElementById('currentFiltered');
  const totalFilteredElement = document.getElementById('totalFiltered');
  const rulesListElement = document.getElementById('rulesList');
  const customRulesListElement = document.getElementById('customRulesList');
  const newRuleInput = document.getElementById('newRule');
  const addRuleBtn = document.getElementById('addRuleBtn');
  const importFileInput = document.getElementById('importFile');
  const importBtn = document.getElementById('importBtn');
  const exportBtn = document.getElementById('exportBtn');
  const menuItems = document.querySelectorAll('.menu-item');
  const tabContents = document.querySelectorAll('.tab-content');

  // 初始化菜单切换
  menuItems.forEach(item => {
    item.addEventListener('click', function() {
      // 移除所有菜单项的活动状态
      menuItems.forEach(i => i.classList.remove('active'));
      // 添加当前菜单项的活动状态
      this.classList.add('active');

      // 隐藏所有面板
      tabContents.forEach(content => content.classList.remove('active'));
      // 显示当前面板
      const tabId = this.getAttribute('data-tab');
      document.getElementById(tabId + '-tab').classList.add('active');

      // 如果是自定义规则面板，则渲染规则列表
      if (tabId === 'custom-rules') {
        chrome.storage.local.get('rules', function(data) {
          const rules = data.rules || getDefaultRules();
          renderCustomRulesList(rules);
        });
      }
    });
  });

  // 从存储中加载设置
  chrome.storage.local.get(['enabled', 'rules', 'totalResults', 'matchedResults', 'currentFiltered', 'totalFiltered'], function(data) {
    // 设置启用状态
    enableFilterCheckbox.checked = data.enabled !== false; // 默认为true

    // 显示统计信息
    totalResultsElement.textContent = data.totalResults || 0;
    matchedResultsElement.textContent = data.matchedResults || 0;
    currentFilteredElement.textContent = data.currentFiltered || 0;
    totalFilteredElement.textContent = data.totalFiltered || 0;

    // 显示规则列表
    const rules = data.rules || getDefaultRules();
    renderRulesList(rules);
  });

  // 定期更新统计信息
  function updateStats() {
    chrome.storage.local.get(['totalResults', 'matchedResults', 'currentFiltered', 'totalFiltered'], function(data) {
      totalResultsElement.textContent = data.totalResults || 0;
      matchedResultsElement.textContent = data.matchedResults || 0;
      currentFilteredElement.textContent = data.currentFiltered || 0;
      totalFilteredElement.textContent = data.totalFiltered || 0;
    });
  }

  // 每秒更新一次统计信息，确保显示最新数据
  setInterval(updateStats, 1000);

  // 监听启用/禁用开关变化
  enableFilterCheckbox.addEventListener('change', function() {
    const enabled = enableFilterCheckbox.checked;
    chrome.storage.local.set({ enabled: enabled }, function() {
      // 通知内容脚本状态变化
      chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleFilter', enabled: enabled });
        }
      });
    });
  });

  // 添加新规则
  addRuleBtn.addEventListener('click', function() {
    addNewRule();
  });

  // 按Enter键添加新规则
  newRuleInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      addNewRule();
    }
  });

  // 添加新规则的函数
  function addNewRule() {
    const newRule = newRuleInput.value.trim();
    if (newRule) {
      chrome.storage.local.get('rules', function(data) {
        const rules = data.rules || getDefaultRules();
        if (!rules.includes(newRule)) {
          rules.push(newRule);
          chrome.storage.local.set({ rules: rules }, function() {
            renderRulesList(rules);
            newRuleInput.value = '';

            // 通知内容脚本规则已更新
            chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
              if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, { action: 'updateRules', rules: rules });
              }
            });
          });
        } else {
          alert('该规则已存在！');
        }
      });
    }
  }

  // 渲染规则列表
  function renderRulesList(rules) {
    rulesListElement.innerHTML = '';
    rules.forEach(function(rule) {
      const ruleItem = document.createElement('div');
      ruleItem.className = 'rule-item';

      const ruleText = document.createElement('span');
      ruleText.className = 'rule-text';
      ruleText.textContent = rule;

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'delete-rule';
      deleteBtn.innerHTML = '&times;';
      deleteBtn.addEventListener('click', function() {
        deleteRule(rule);
      });

      ruleItem.appendChild(ruleText);
      ruleItem.appendChild(deleteBtn);
      rulesListElement.appendChild(ruleItem);
    });
  }

  // 删除规则
  function deleteRule(rule) {
    chrome.storage.local.get('rules', function(data) {
      const rules = data.rules || getDefaultRules();
      const index = rules.indexOf(rule);
      if (index !== -1) {
        rules.splice(index, 1);
        chrome.storage.local.set({ rules: rules }, function() {
          renderRulesList(rules);

          // 通知内容脚本规则已更新
          chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            if (tabs[0]) {
              chrome.tabs.sendMessage(tabs[0].id, { action: 'updateRules', rules: rules });
            }
          });
        });
      }
    });
  }

  // 渲染自定义规则列表
  function renderCustomRulesList(rules) {
    customRulesListElement.innerHTML = '';
    rules.forEach(function(rule) {
      const ruleItem = document.createElement('div');
      ruleItem.className = 'rule-item';

      const ruleText = document.createElement('span');
      ruleText.className = 'rule-text';
      ruleText.textContent = rule;

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'delete-rule';
      deleteBtn.innerHTML = '&times;';
      deleteBtn.addEventListener('click', function() {
        deleteRule(rule);
      });

      ruleItem.appendChild(ruleText);
      ruleItem.appendChild(deleteBtn);
      customRulesListElement.appendChild(ruleItem);
    });
  }

  // 导入规则
  importBtn.addEventListener('click', function() {
    const file = importFileInput.files[0];
    if (!file) {
      alert('请选择要导入的规则文件！');
      return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
      const content = e.target.result;
      const lines = content.split('\n');
      const newRules = [];
      const invalidRules = [];

      lines.forEach(line => {
        const trimmedLine = line.trim();
        if (trimmedLine) {
          // 检查是否符合域名格式
          const isValidDomain = /^([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}(\/(\*)?)?$/.test(trimmedLine) ||
                              /^\*\.([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}(\/(\*)?)?$/.test(trimmedLine);

          if (isValidDomain && !newRules.includes(trimmedLine)) {
            newRules.push(trimmedLine);
          } else if (!isValidDomain && trimmedLine.length > 0) {
            invalidRules.push(trimmedLine);
          }
        }
      });

      if (newRules.length > 0) {
        chrome.storage.local.get('rules', function(data) {
          let rules = data.rules || getDefaultRules();

          // 合并新规则，去除重复
          newRules.forEach(rule => {
            if (!rules.includes(rule)) {
              rules.push(rule);
            }
          });

          chrome.storage.local.set({ rules: rules }, function() {
            renderRulesList(rules);
            renderCustomRulesList(rules);

            let message = `成功导入 ${newRules.length} 条规则！`;
            if (invalidRules.length > 0) {
              message += `\n有 ${invalidRules.length} 条规则格式无效，已忽略。`;
            }
            alert(message);

            // 通知内容脚本规则已更新
            chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
              if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, { action: 'updateRules', rules: rules });
              }
            });
          });
        });
      } else {
        let message = '没有找到有效的规则！';
        if (invalidRules.length > 0) {
          message += `\n有 ${invalidRules.length} 条规则格式无效，请确保每行一个域名或泛域名，如：\nexample.com\n*.example.com\nexample.com/*\n*.example.com/*`;
        }
        alert(message);
      }
    };
    reader.readAsText(file);
  });

  // 导出规则
  exportBtn.addEventListener('click', function() {
    chrome.storage.local.get('rules', function(data) {
      const rules = data.rules || getDefaultRules();

      if (rules.length === 0) {
        alert('没有可导出的规则！');
        return;
      }

      // 创建导出内容
      let content = '';
      rules.forEach(rule => {
        content += `${rule}\n`;
      });

      // 创建并下载文件
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = '过滤规则_' + new Date().toISOString().slice(0, 10) + '.txt';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  });

  // 获取默认规则 - 与manifest.json中的rules_domain保持一致
  function getDefaultRules() {
    return ['csdn.net', 'zhihu.com', 'docin.com', 'doc88.com', '*.csdn.net/*', '*.zhihu.com/*'];
  }
});
