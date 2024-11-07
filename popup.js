// 添加更新显示的函数
window.updateDisplay = function(data) {
  if (data) {
    if (data.savedSiteData) {
      updateSitesList(data.savedSiteData);
    }
    if (data.savedVisitRecords) {
      updateVisitDetails(data.savedVisitRecords, data.savedSiteData);
    }
    if (data.savedDailyStats) {
      updateBasicStats(data.savedSiteData, data.savedDailyStats);
    }
    if (data.aiSummary) {
      const summaryElement = document.getElementById('ai-summary');
      const statusElement = document.getElementById('summary-status');
      if (summaryElement && statusElement) {
        summaryElement.textContent = data.aiSummary.content;
        summaryElement.style.whiteSpace = 'pre-line';
        statusElement.textContent = `上次生成时间: ${new Date(data.aiSummary.generateTime).toLocaleTimeString()}`;
      }
    }
  }
};

// 修改生成总结函数
async function generateSummary() {
  console.log('开始生成总结...');

  const statusElement = document.getElementById('summary-status');
  const summaryElement = document.getElementById('ai-summary');
  const generateButton = document.getElementById('generateSummary');

  if (!statusElement || !summaryElement || !generateButton) {
    console.error('找不到必要的 DOM 元素');
    return;
  }

  try {
    // 设置加载状态
    statusElement.textContent = '正在生成总结...';
    generateButton.disabled = true;
    summaryElement.textContent = '分析中，请稍候...';

    // 获取当前数据
    const { savedSiteData, savedDailyStats } = await chrome.storage.local.get(['savedSiteData', 'savedDailyStats']);
    
    if (!savedSiteData || Object.keys(savedSiteData).length === 0) {
      throw new Error('没有可用的浏览数据');
    }

    // 格式化数据
    let analysisData = "请简要分析以下今日的浏览数据：\n\n";
    analysisData += `访问网站数：${Object.keys(savedSiteData).length}\n`;
    analysisData += `Chrome使用时长：${Math.round(savedDailyStats.totalChromeTime / 60)}分钟\n\n`;
    
    // 添加网站访问详情（只包含前10个最常访问的网站）
    analysisData += "主要访问网站：\n";
    Object.entries(savedSiteData)
      .sort((a, b) => b[1].totalTime - a[1].totalTime)
      .slice(0, 10)  // 只取前10个
      .forEach(([domain, data]) => {
        const minutes = Math.round(data.totalTime / 1000 / 60);
        analysisData += `\n${data.title || domain}\n`;
        analysisData += `- 访问：${data.visits}次，时长：${minutes}分钟\n`;
      });

    // 设置超时
    const timeout = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('请求超时')), 30000)
    );

    // 调用 AI API
    const fetchPromise = fetch("https://open.bigmodel.cn/api/paas/v4/chat/completions", {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer d9965556e819c33bc892623f62199404.kfZMM04pLZ5Azb1R'
      },
      body: JSON.stringify({
        model: "glm-4",
        messages: [{
          role: "system",
          content: "你是一个简洁的网络行为分析师，请用简短的语言分析用户的浏览数据。"
        }, {
          role: "user",
          content: analysisData
        }],
        temperature: 0.7,
        stream: false
      })
    });

    // 使用 Promise.race 处理超时
    const response = await Promise.race([fetchPromise, timeout]);

    if (!response.ok) {
      throw new Error(`API 请求失败: ${response.status}`);
    }

    const result = await response.json();
    console.log('AI 响应:', result);

    let summary = '';
    if (result && result.choices && result.choices[0] && result.choices[0].message) {
      // 新版 API 格式
      summary = result.choices[0].message.content;
    } else if (result && result.data && result.data.choices && result.data.choices[0]) {
      // 旧版 API 格式
      summary = result.data.choices[0].content;
    } else {
      console.error('无效的 AI 响应格式:', result);
      throw new Error('无法解析 AI 响应');
    }

    if (summary) {
      // 显示结果
      summaryElement.textContent = summary;
      summaryElement.style.whiteSpace = 'pre-line';
      statusElement.textContent = `生成完成 (${new Date().toLocaleTimeString()})`;
      
      // 保存结果
      await chrome.storage.local.set({
        aiSummary: {
          content: summary,
          generateTime: Date.now(),
          date: new Date().toDateString()
        }
      });
    } else {
      throw new Error('AI 返回的内容为空');
    }

  } catch (error) {
    console.error('生成总结失败:', error);
    statusElement.textContent = '生成失败，请重试';
    summaryElement.textContent = '错误：' + error.message;
  } finally {
    generateButton.disabled = false;
  }
}

// 添加排序按钮事件绑定函数
function bindSortButtons() {
  document.querySelectorAll('.sort-button').forEach(button => {
    button.addEventListener('click', () => {
      const listType = button.dataset.list;
      const sortType = button.dataset.sort;
      
      // 更新按钮状态
      document.querySelectorAll(`.sort-button[data-list="${listType}"]`)
        .forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');

      // 获取最新数据并重新排序
      chrome.storage.local.get(['savedSiteData', 'savedVisitRecords'], (data) => {
        if (listType === 'sites' && data.savedSiteData) {
          updateSitesList(data.savedSiteData, sortType);
        } else if (listType === 'records' && data.savedVisitRecords) {
          updateVisitDetails(data.savedVisitRecords, data.savedSiteData, sortType);
        }
      });
    });
  });
}

// 修改初始化部分，确保所有事件都被正确绑定
document.addEventListener('DOMContentLoaded', async () => {
  try {
    console.log('Popup 页面加载...');
    
    // 获取存储的数据
    const { savedSiteData, savedDailyStats, savedVisitRecords } = 
      await chrome.storage.local.get(['savedSiteData', 'savedDailyStats', 'savedVisitRecords']);
    
    console.log('获取到的数据:', {
      siteData: savedSiteData,
      dailyStats: savedDailyStats,
      visitRecords: savedVisitRecords
    });

    // 更新显示
    if (savedSiteData && savedDailyStats) {
      updateBasicStats(savedSiteData, savedDailyStats);
      updateSitesList(savedSiteData);
      if (savedVisitRecords) {
        updateVisitDetails(savedVisitRecords, savedSiteData);
      }
    }

    // 绑定所有按钮事件
    bindSortButtons();
    
    // 绑定生成总结按钮事件
    const generateButton = document.getElementById('generateSummary');
    if (generateButton) {
      generateButton.addEventListener('click', generateSummary);
    }
    
    // 绑定复制数据按钮事件
    const copyButton = document.getElementById('copyData');
    if (copyButton) {
      copyButton.addEventListener('click', copyBrowsingData);
    }

    // 加载已保存的 AI 总结
    const { aiSummary } = await chrome.storage.local.get('aiSummary');
    if (aiSummary && aiSummary.date === new Date().toDateString()) {
      const summaryElement = document.getElementById('ai-summary');
      const statusElement = document.getElementById('summary-status');
      if (summaryElement && statusElement) {
        summaryElement.textContent = aiSummary.content;
        summaryElement.style.whiteSpace = 'pre-line';
        statusElement.textContent = `上次生成时间: ${new Date(aiSummary.generateTime).toLocaleTimeString()}`;
      }
    }

    // 绑定导出全部数据按钮事件
    const exportButton = document.getElementById('exportAllData');
    if (exportButton) {
      exportButton.addEventListener('click', exportAllData);
    }

    // 绑定导出TXT按钮事件
    const exportTxtButton = document.getElementById('exportTxt');
    if (exportTxtButton) {
      exportTxtButton.addEventListener('click', exportToTxt);
    }

  } catch (error) {
    console.error('Popup 初始化错误:', error);
  }
});

// 添加格式化时间的函数
function formatDuration(milliseconds) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  
  if (minutes === 0) {
    return `${seconds}秒`;
  }
  return `${minutes}分${seconds}秒`;
}

// 修改更新网站列表函数中的时间显示
function updateSitesList(siteData, sortType = 'time') {
  const sitesList = document.getElementById('sitesList');
  if (!sitesList || !siteData) {
    console.log('找不到网站列表元素或没有数据');
    return;
  }

  let sortedSites = Object.entries(siteData)
    .filter(([_, data]) => data.totalTime > 0) // 只显示有停留时间的网站
    .sort((a, b) => {
      switch (sortType) {
        case 'time':
          return b[1].lastVisit - a[1].lastVisit;
        case 'duration':
          return b[1].totalTime - a[1].totalTime;
        case 'visits':
          return b[1].visits - a[1].visits;
        default:
          return 0;
      }
    });

  const html = sortedSites.map(([domain, data], index) => {
    const duration = formatDuration(data.totalTime);
    return `
      <div class="site-item">
        <div class="site-info">
          <div class="site-title">
            <span class="site-index">${index + 1}. </span>
            ${data.title || domain}
          </div>
          <div class="site-stats">
            访问次数: ${data.visits} | 停留时间: ${duration}
          </div>
        </div>
        <button class="delete-btn" data-domain="${domain}">×</button>
      </div>
    `;
  }).join('');

  sitesList.innerHTML = html || '<div class="empty-message">暂无访问记录</div>';

  // 绑定删除按钮事件
  sitesList.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const domain = btn.dataset.domain;
      if (domain) {
        await deleteSiteItem(domain);
      }
    });
  });
}

// 修改更新访问明细函数中的时间显示
function updateVisitDetails(visitRecords, siteData, sortType = 'time') {
  const fullList = document.getElementById('fullList');
  if (!fullList || !visitRecords) {
    console.log('找不到访问明细列表元素或没有数据');
    return;
  }

  let sortedRecords = [...visitRecords]
    .filter(record => record.duration > 0) // 只显示有停留时间的记录
    .sort((a, b) => {
      switch (sortType) {
        case 'time':
          return b.timestamp - a.timestamp;
        case 'duration':
          return b.duration - a.duration;
        case 'visits':
          const visitsA = visitRecords.filter(r => r.domain === a.domain).length;
          const visitsB = visitRecords.filter(r => r.domain === b.domain).length;
          return visitsB - visitsA;
        default:
          return 0;
      }
    });

  const html = sortedRecords.map((record, index) => {
    const duration = formatDuration(record.duration);
    const time = new Date(record.timestamp).toLocaleTimeString();
    return `
      <div class="site-item">
        <div class="site-info">
          <div class="site-title">
            <span class="site-index">${index + 1}. </span>
            ${record.title || record.url}
          </div>
          <div class="site-stats">
            访问时间: ${time} | 停留时间: ${duration}
          </div>
        </div>
        <button class="delete-btn" data-index="${index}">×</button>
      </div>
    `;
  }).join('');

  fullList.innerHTML = html || '<div class="empty-message">暂无访问记录</div>';

  // 绑定删除按钮事件
  fullList.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const index = parseInt(btn.dataset.index);
      if (!isNaN(index)) {
        await deleteVisitRecord(index);
      }
    });
  });
}

// 修改基础统计信息中的时间显示
function updateBasicStats(siteData, dailyStats) {
  if (!siteData || !dailyStats) {
    console.log('没有可用的统计数据');
    return;
  }

  const uniqueSites = Object.keys(siteData).filter(domain => siteData[domain].totalTime > 0).length;
  const totalVisits = Object.values(siteData)
    .filter(site => site.totalTime > 0)
    .reduce((sum, site) => sum + site.visits, 0);
  const chromeTime = formatDuration(dailyStats.totalChromeTime * 1000);

  document.getElementById('uniqueSites').textContent = uniqueSites;
  document.getElementById('totalVisits').textContent = totalVisits;
  document.getElementById('chromeOpenCount').textContent = dailyStats.chromeOpenCount || 0;
  document.getElementById('totalChromeTime').textContent = chromeTime;
}

// 修改复制浏览数据功能
async function copyBrowsingData() {
  try {
    const { savedSiteData, savedDailyStats, savedVisitRecords } = 
      await chrome.storage.local.get(['savedSiteData', 'savedDailyStats', 'savedVisitRecords']);
    
    if (!savedSiteData || !savedDailyStats) {
      throw new Error('没有可用的浏览数据');
    }

    // 格式化数据
    let exportData = "请分析我今天的浏览数据，给出工作学习情况分析和建议。\n\n";
    
    // 添加基础统计
    exportData += "基础统计：\n";
    exportData += `访问网站数：${Object.keys(savedSiteData).length}\n`;
    exportData += `总访问次数：${Object.values(savedSiteData).reduce((sum, site) => sum + site.visits, 0)}\n`;
    exportData += `Chrome使用时间：${Math.round(savedDailyStats.totalChromeTime / 60)}分钟\n\n`;

    // 添加详细网站访问数据
    exportData += "网站访问统计：\n";
    Object.entries(savedSiteData)
      .sort((a, b) => b[1].totalTime - a[1].totalTime)
      .forEach(([domain, data]) => {
        const minutes = Math.round(data.totalTime / 1000 / 60);
        exportData += `${data.title || domain}\n`;
        exportData += `访问：${data.visits}次，时长：${minutes}分钟\n\n`;
      });

    // 添加长时间使用分析
    const longSessions = Object.entries(savedSiteData)
      .filter(([_, data]) => (data.totalTime / 1000 / 60) > 30)
      .map(([domain, data]) => ({
        title: data.title || domain,
        duration: Math.round(data.totalTime / 1000 / 60)
      }));

    if (longSessions.length > 0) {
      exportData += "长时间使用：\n";
      longSessions.forEach(session => {
        exportData += `${session.title}：${session.duration}分钟\n`;
      });
    }

    // 复制到剪贴板
    await navigator.clipboard.writeText(exportData);

    // 显示成功提示
    const copyButton = document.getElementById('copyData');
    const originalText = copyButton.textContent;
    copyButton.textContent = '复制成功！';
    copyButton.style.backgroundColor = '#4CAF50';
    copyButton.style.color = 'white';

    // 3秒后恢复按钮原始状态
    setTimeout(() => {
      copyButton.textContent = originalText;
      copyButton.style.backgroundColor = '';
      copyButton.style.color = '';
    }, 3000);

  } catch (error) {
    console.error('复制数据失败:', error);
    const copyButton = document.getElementById('copyData');
    copyButton.textContent = '复制失败，请重试';
    copyButton.style.backgroundColor = '#f44336';
    copyButton.style.color = 'white';
    
    setTimeout(() => {
      copyButton.textContent = '复制今日浏览数据';
      copyButton.style.backgroundColor = '';
      copyButton.style.color = '';
    }, 3000);
  }
}

// 添加删除网站记录的函数
async function deleteSiteItem(domain) {
  try {
    // 获取当前数据
    const { savedSiteData, savedVisitRecords, savedDailyStats } = 
      await chrome.storage.local.get(['savedSiteData', 'savedVisitRecords', 'savedDailyStats']);
    
    if (savedSiteData && savedSiteData[domain]) {
      // 删除网站数据
      delete savedSiteData[domain];
      
      // 过滤相关的访问记录
      const filteredRecords = savedVisitRecords.filter(record => {
        try {
          const recordDomain = new URL(record.url).hostname;
          return recordDomain !== domain;
        } catch (e) {
          return true;
        }
      });
      
      // 更新统计数据
      savedDailyStats.totalVisits = Object.values(savedSiteData).reduce((sum, site) => sum + site.visits, 0);
      
      // 保存更新后的数据
      await chrome.storage.local.set({
        savedSiteData,
        savedVisitRecords: filteredRecords,
        savedDailyStats
      });
      
      // 通知 background 页面更新数据
      await chrome.runtime.sendMessage({
        type: 'DATA_UPDATED',
        data: {
          savedSiteData,
          savedVisitRecords: filteredRecords,
          savedDailyStats
        }
      });
      
      // 更新显示
      updateSitesList(savedSiteData);
      updateVisitDetails(filteredRecords, savedSiteData);
      updateBasicStats(savedSiteData, savedDailyStats);
    }
  } catch (error) {
    console.error('删除网站记录失败:', error);
  }
}

// 添加删除访问记录的函数
async function deleteVisitRecord(index) {
  try {
    // 获取当前数据
    const { savedSiteData, savedVisitRecords, savedDailyStats } = 
      await chrome.storage.local.get(['savedSiteData', 'savedVisitRecords', 'savedDailyStats']);
    
    if (savedVisitRecords && savedVisitRecords[index]) {
      // 获取要删除的记录
      const recordToDelete = savedVisitRecords[index];
      
      // 从数组中删除该记录
      savedVisitRecords.splice(index, 1);
      
      // 更新相关网站的访问统计
      if (savedSiteData && recordToDelete.url) {
        try {
          const domain = new URL(recordToDelete.url).hostname;
          if (savedSiteData[domain]) {
            savedSiteData[domain].visits--;
            if (savedSiteData[domain].visits <= 0) {
              delete savedSiteData[domain];
            }
          }
        } catch (e) {
          console.error('解析 URL 失败:', e);
        }
      }
      
      // 更新统计数据
      savedDailyStats.totalVisits = Object.values(savedSiteData).reduce((sum, site) => sum + site.visits, 0);
      
      // 保存更新后的数据
      await chrome.storage.local.set({
        savedSiteData,
        savedVisitRecords,
        savedDailyStats
      });
      
      // 通知 background 页面更新数据
      await chrome.runtime.sendMessage({
        type: 'DATA_UPDATED',
        data: {
          savedSiteData,
          savedVisitRecords,
          savedDailyStats
        }
      });
      
      // 更新显示
      updateSitesList(savedSiteData);
      updateVisitDetails(savedVisitRecords, savedSiteData);
      updateBasicStats(savedSiteData, savedDailyStats);
    }
  } catch (error) {
    console.error('除访问记录失败:', error);
  }
}

// 修改导出全部数据功能
async function exportAllData() {
  try {
    // 获取所有数据
    const {
      savedSiteData,
      savedDailyStats,
      savedVisitRecords,
      aiSummary
    } = await chrome.storage.local.get([
      'savedSiteData',
      'savedDailyStats',
      'savedVisitRecords',
      'aiSummary'
    ]);

    // 创建 CSV 内容
    let csvContent = "数据类型,内容\n";
    
    // 添加基础统计
    csvContent += "基础统计,\n";
    csvContent += `访问网站数,${Object.keys(savedSiteData || {}).length}\n`;
    csvContent += `总访问次数,${Object.values(savedSiteData || {}).reduce((sum, site) => sum + site.visits, 0)}\n`;
    csvContent += `Chrome启动次数,${savedDailyStats?.chromeOpenCount || 0}\n`;
    csvContent += `Chrome使用时长(分钟),${Math.round((savedDailyStats?.totalChromeTime || 0) / 60)}\n\n`;

    // 添加网站访问数据
    csvContent += "网站访问详情,\n";
    csvContent += "序号,网站标题,域名,访问次数,停留时间(分钟),最后访问时间\n";
    
    if (savedSiteData) {
      Object.entries(savedSiteData)
        .sort((a, b) => b[1].totalTime - a[1].totalTime)
        .forEach(([domain, data], index) => {
          csvContent += `${index + 1},${data.title || domain},${domain},${data.visits},`;
          csvContent += `${Math.round(data.totalTime / 1000 / 60)},`;
          csvContent += `${new Date(data.lastVisit).toLocaleString()}\n`;
        });
    }

    csvContent += "\n访问记录明细,\n";
    csvContent += "序号,网站标题,URL,访问时间,停留时间(分钟)\n";
    
    if (savedVisitRecords) {
      savedVisitRecords
        .sort((a, b) => b.timestamp - a.timestamp)
        .forEach((record, index) => {
          csvContent += `${index + 1},${record.title || ''},${record.url},`;
          csvContent += `${new Date(record.timestamp).toLocaleString()},`;
          csvContent += `${Math.round(record.duration / 1000 / 60)}\n`;
        });
    }

    // 添加 AI 分析总结
    if (aiSummary && aiSummary.content) {
      csvContent += "\nAI分析总结,\n";
      csvContent += `生成时间,${new Date(aiSummary.generateTime).toLocaleString()}\n`;
      csvContent += `分析内容,${aiSummary.content.replace(/\n/g, ' ')}\n`;
    }

    // 创建 Blob
    const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    
    // 创建下载链接
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `browsing_data_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    
    // 触发下载
    link.click();
    
    // 清理
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    // 显示成功提示
    const exportButton = document.getElementById('exportAllData');
    const originalText = exportButton.textContent;
    exportButton.textContent = '导出成功！';
    exportButton.style.backgroundColor = '#4CAF50';
    exportButton.style.color = 'white';

    setTimeout(() => {
      exportButton.textContent = originalText;
      exportButton.style.backgroundColor = '';
      exportButton.style.color = '';
    }, 3000);

  } catch (error) {
    console.error('导出数据失败:', error);
    const exportButton = document.getElementById('exportAllData');
    exportButton.textContent = '导出失败: ' + error.message;
    exportButton.style.backgroundColor = '#f44336';
    exportButton.style.color = 'white';
    
    setTimeout(() => {
      exportButton.textContent = '导出全部数据';
      exportButton.style.backgroundColor = '';
      exportButton.style.color = '';
    }, 3000);
  }
}

// 添加导出 TXT 文件功能
async function exportToTxt() {
  try {
    const { savedSiteData, savedDailyStats, savedVisitRecords, aiSummary } = 
      await chrome.storage.local.get(['savedSiteData', 'savedDailyStats', 'savedVisitRecords', 'aiSummary']);
    
    // 创建文本内容
    let content = "=== 浏览数据导出 ===\n";
    content += `导出时间：${new Date().toLocaleString()}\n\n`;
    
    // 基础统计
    content += "=== 基础统计 ===\n";
    content += `访问网站数：${Object.keys(savedSiteData || {}).length}\n`;
    content += `总访问次数：${Object.values(savedSiteData || {}).reduce((sum, site) => sum + site.visits, 0)}\n`;
    content += `Chrome启动次数：${savedDailyStats?.chromeOpenCount || 0}\n`;
    content += `Chrome使用时间：${Math.round((savedDailyStats?.totalChromeTime || 0) / 60)}分钟\n\n`;

    // 网站访问统计
    content += "=== 网站访问统计 ===\n";
    Object.entries(savedSiteData || {})
      .sort((a, b) => b[1].totalTime - a[1].totalTime)
      .forEach(([domain, data], index) => {
        const minutes = Math.round(data.totalTime / 1000 / 60);
        content += `\n${index + 1}. ${data.title || domain}\n`;
        content += `   网址：${domain}\n`;
        content += `   访问次数：${data.visits}次\n`;
        content += `   停留时间：${minutes}分钟\n`;
        content += `   最后访问：${new Date(data.lastVisit).toLocaleString()}\n`;
      });

    // 访问记录明细
    content += "\n=== 访问记录明细 ===\n";
    (savedVisitRecords || [])
      .sort((a, b) => b.timestamp - a.timestamp)
      .forEach((record, index) => {
        const duration = Math.round(record.duration / 1000 / 60);
        content += `\n${index + 1}. ${record.title || record.url}\n`;
        content += `   网址：${record.url}\n`;
        content += `   访问时间：${new Date(record.timestamp).toLocaleString()}\n`;
        content += `   停留时间：${duration}分钟\n`;
      });

    // AI 分析总结
    if (aiSummary && aiSummary.content) {
      content += "\n=== AI 分析总结 ===\n";
      content += `生成时间：${new Date(aiSummary.generateTime).toLocaleString()}\n\n`;
      content += aiSummary.content + "\n";
    }

    // 创建 Blob
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    // 创建下载链接
    const link = document.createElement('a');
    link.href = url;
    link.download = `browsing_data_${new Date().toISOString().split('T')[0]}.txt`;
    
    // 触发下载
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // 清理 URL
    URL.revokeObjectURL(url);

    // 显示成功提示
    const exportTxtButton = document.getElementById('exportTxt');
    const originalText = exportTxtButton.textContent;
    exportTxtButton.textContent = '导出成功！';
    exportTxtButton.style.backgroundColor = '#4CAF50';
    exportTxtButton.style.color = 'white';

    setTimeout(() => {
      exportTxtButton.textContent = originalText;
      exportTxtButton.style.backgroundColor = '';
      exportTxtButton.style.color = '';
    }, 3000);

  } catch (error) {
    console.error('导出TXT失败:', error);
    const exportTxtButton = document.getElementById('exportTxt');
    exportTxtButton.textContent = '导出失败，请重试';
    exportTxtButton.style.backgroundColor = '#f44336';
    exportTxtButton.style.color = 'white';
    
    setTimeout(() => {
      exportTxtButton.textContent = '导出TXT文件';
      exportTxtButton.style.backgroundColor = '';
      exportTxtButton.style.color = '';
    }, 3000);
  }
}