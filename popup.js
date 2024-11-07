// 添加数据更新和显示功能
let isGeneratingSummary = false;

// 初始化 popup
document.addEventListener('DOMContentLoaded', async () => {
  try {
    console.log('Popup 页面加载...');
    // 获取存储的数据
    const { savedSiteData, savedDailyStats } = await chrome.storage.local.get(['savedSiteData', 'savedDailyStats']);
    console.log('获取到的数据:', { savedSiteData, savedDailyStats });

    // 更新基础统计信息
    updateBasicStats(savedSiteData, savedDailyStats);
    
    // 更新网站列表
    updateSiteLists(savedSiteData);

    // 绑定排序按钮事件
    bindSortButtons(savedSiteData);

    // 绑定生成总结按钮事件
    document.getElementById('generateSummary')?.addEventListener('click', generateSummary);
    
    // 绑定复制数据按钮事件
    document.getElementById('copyData')?.addEventListener('click', copyBrowsingData);

    // 监听来自 background 的更新消息
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'UPDATE_STATS') {
        updateBasicStats(message.data.siteData, message.data.dailyStats);
        updateSiteLists(message.data.siteData);
      }
    });

  } catch (error) {
    console.error('Popup 初始化错误:', error);
  }
});

// 更新基础统计信息
function updateBasicStats(siteData, dailyStats) {
  if (!siteData || !dailyStats) {
    console.log('没有可用的统计数据');
    return;
  }

  console.log('更新基础统计:', { siteData, dailyStats });

  document.getElementById('uniqueSites').textContent = Object.keys(siteData).length;
  
  const totalVisits = Object.values(siteData).reduce((sum, site) => sum + site.visits, 0);
  document.getElementById('totalVisits').textContent = totalVisits;
  
  document.getElementById('chromeOpenCount').textContent = dailyStats.chromeOpenCount;
  document.getElementById('totalChromeTime').textContent = 
    Math.round(dailyStats.totalChromeTime / 60) + '分钟';
}

// 更新网站列表
function updateSiteLists(siteData) {
  if (!siteData) {
    console.log('没有可用的网站数据');
    return;
  }

  console.log('更新网站列表:', siteData);

  // 更新最近访问列表
  const recentList = document.getElementById('recentList');
  if (recentList) {
    const sortedRecent = Object.entries(siteData)
      .sort((a, b) => b[1].lastVisit - a[1].lastVisit)
      .slice(0, 5);
      
    recentList.innerHTML = sortedRecent
      .map(([domain, data]) => createSiteElement(domain, data))
      .join('');
  }

  // 更新完整列表
  updateFullList(siteData);
}

// 更新完整列表
function updateFullList(siteData) {
  const fullList = document.getElementById('fullList');
  if (!fullList) return;

  const activeSortButton = document.querySelector('.sort-button.active');
  const sortType = activeSortButton ? activeSortButton.dataset.sort : 'time';

  let sortedSites = Object.entries(siteData);

  switch (sortType) {
    case 'time':
      sortedSites.sort((a, b) => b[1].lastVisit - a[1].lastVisit);
      break;
    case 'duration':
      sortedSites.sort((a, b) => b[1].totalTime - a[1].totalTime);
      break;
    case 'visits':
      sortedSites.sort((a, b) => b[1].visits - a[1].visits);
      break;
  }

  fullList.innerHTML = sortedSites
    .map(([domain, data]) => createSiteElement(domain, data))
    .join('');
}

// 创建网站元素
function createSiteElement(domain, data) {
  const minutes = Math.round(data.totalTime / 1000 / 60);
  const timeAgo = Math.round((Date.now() - data.lastVisit) / 1000 / 60);
  
  return `
    <div class="site-item">
      <div class="site-info">
        <div>${data.title || domain}</div>
        <div class="site-stats">
          访问次数: ${data.visits} | 停留时间: ${minutes}分钟 | ${timeAgo}分钟前访问
        </div>
      </div>
    </div>
  `;
}

// 绑定排序按钮事件
function bindSortButtons(siteData) {
  document.querySelectorAll('.sort-button').forEach(button => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.sort-button').forEach(btn => 
        btn.classList.remove('active')
      );
      button.classList.add('active');
      updateFullList(siteData);
    });
  });
}

async function generateSummary() {
  console.log('开始生成总结...');

  if (isGeneratingSummary) {
    console.log('已经在生成总结中...');
    return;
  }

  const statusElement = document.getElementById('summary-status');
  const summaryElement = document.getElementById('ai-summary');
  const generateButton = document.getElementById('generateSummary');

  if (!statusElement || !summaryElement || !generateButton) {
    console.error('找不到必要的 DOM 元素:', { 
      statusElement: !!statusElement,
      summaryElement: !!summaryElement,
      generateButton: !!generateButton
    });
    return;
  }

  try {
    isGeneratingSummary = true;
    statusElement.textContent = '正在生成总结...';
    generateButton.disabled = true;

    console.log('发送消息到 background...');
    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage({
        action: "generateSummary"
      }, (response) => {
        console.log('收到 background 响应:', response);
        resolve(response);
      });
    });

    console.log('处理响应:', response);

    if (response && response.success) {
      statusElement.textContent = '总结生成完成';
      console.log('生成的总结:', response.summary);
      summaryElement.textContent = response.summary;
      summaryElement.style.whiteSpace = 'pre-line';
    } else {
      throw new Error(response?.error || '生成总结失败');
    }

  } catch (error) {
    console.error('生成总结出错:', error);
    statusElement.textContent = '生成总结失败，请重试';
    summaryElement.textContent = '出错了：' + error.message;
  } finally {
    isGeneratingSummary = false;
    generateButton.disabled = false;
  }
}

// 修改复制数据功能
async function copyBrowsingData() {
  try {
    const { savedSiteData, savedDailyStats } = await chrome.storage.local.get(['savedSiteData', 'savedDailyStats']);
    
    if (!savedSiteData || !savedDailyStats) {
      throw new Error('没有可用的浏览数据');
    }

    // 格式化数据
    let exportData = "请根据我今天的浏览网页的数据，分析我今天工作做了什么，学了什么，做了什么不正确的事情，健康习惯分析。\n\n";
    exportData += "📊 今日浏览数据导出\n\n";
    
    // 添加基础统计
    exportData += "基础统计：\n";
    exportData += `• 访问网站数：${Object.keys(savedSiteData).length}\n`;
    const totalVisits = Object.values(savedSiteData).reduce((sum, site) => sum + site.visits, 0);
    exportData += `• 总访问次数：${totalVisits}\n`;
    exportData += `• Chrome启动次数：${savedDailyStats.chromeOpenCount}\n`;
    exportData += `• 总使用时间：${Math.round(savedDailyStats.totalChromeTime / 60)}分钟\n\n`;

    // 添加详细网站访问数据
    exportData += "详细访问记录：\n";
    const sortedSites = Object.entries(savedSiteData)
      .sort((a, b) => b[1].totalTime - a[1].totalTime);

    sortedSites.forEach(([domain, data]) => {
      const minutes = Math.round(data.totalTime / 1000 / 60);
      const lastVisitTime = new Date(data.lastVisit);
      exportData += `\n${data.title || domain}\n`;
      exportData += `• 访问次数：${data.visits}次\n`;
      exportData += `• 停留时间：${minutes}分钟\n`;
      exportData += `• 最后访问：${lastVisitTime.toLocaleTimeString()}\n`;
      exportData += `• 域名：${domain}\n`;
    });

    // 添加时间分布分析
    exportData += "\n时间分布分析：\n";
    const timeDistribution = {
      morning: 0,   // 5:00-12:00
      afternoon: 0, // 12:00-18:00
      evening: 0    // 18:00-次日5:00
    };

    sortedSites.forEach(([_, data]) => {
      const hour = new Date(data.lastVisit).getHours();
      if (hour >= 5 && hour < 12) timeDistribution.morning++;
      else if (hour >= 12 && hour < 18) timeDistribution.afternoon++;
      else timeDistribution.evening++;
    });

    exportData += `• 上午 (5:00-12:00): ${timeDistribution.morning} 次访问\n`;
    exportData += `• 下午 (12:00-18:00): ${timeDistribution.afternoon} 次访问\n`;
    exportData += `• 晚上 (18:00-次日5:00): ${timeDistribution.evening} 次访问\n\n`;

    // 添加长时间使用分析
    const longSessions = sortedSites
      .filter(([_, data]) => (data.totalTime / 1000 / 60) > 30)
      .map(([domain, data]) => ({
        domain,
        title: data.title,
        duration: Math.round(data.totalTime / 1000 / 60)
      }));

    if (longSessions.length > 0) {
      exportData += "\n长时间使用分析：\n";
      longSessions.forEach(session => {
        exportData += `• ${session.title || session.domain}: ${session.duration}分钟\n`;
      });
    }

    // 复制到剪贴板
    await navigator.clipboard.writeText(exportData);

    // 显示成功提示
    const copyButton = document.getElementById('copyData');
    const originalText = copyButton.textContent;
    copyButton.textContent = '复制成功！';
    copyButton.classList.add('copy-success');

    // 3秒后恢复按钮原始状态
    setTimeout(() => {
      copyButton.textContent = originalText;
      copyButton.classList.remove('copy-success');
    }, 3000);

  } catch (error) {
    console.error('复制数据失败:', error);
    const copyButton = document.getElementById('copyData');
    copyButton.textContent = '复制失败，请重试';
    setTimeout(() => {
      copyButton.textContent = '复制今日浏览数据';
    }, 3000);
  }
} 