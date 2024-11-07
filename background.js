let startTime = {};
let siteData = {};
let dailyStats = {
  date: new Date().toDateString(),
  chromeOpenCount: 0,
  totalChromeTime: 0,
  chromeStartTime: null,
  aiSummary: null,
  summaryGeneratedTime: null
};
let activeTabId = null;

// 添加访问记录数组
let visitRecords = [];

// 使用普通方式导入配置，不使用 ES modules
const AI_CONFIG = {
  endpoint: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
  apiKey: "d9965556e819c33bc892623f62199404.kfZMM04pLZ5Azb1R"
};

// 添加 API Key 配置函数
async function setApiKey(key) {
  await chrome.storage.local.set({ 'zhipuApiKey': key });
}

// 获取 API Key
async function getApiKey() {
  const { zhipuApiKey } = await chrome.storage.local.get('zhipuApiKey');
  return zhipuApiKey;
}

// 修改内容检测函数，使用更专业的术语
function checkContentSafety(url, title) {
  // 使用更专业的关键词
  const unsafeKeywords = [
    'inappropriate',
    'unsafe',
    'restricted',
    'nsfw',
    'explicit'
  ];

  const content = (url + ' ' + (title || '')).toLowerCase();
  return unsafeKeywords.some(keyword => content.includes(keyword));
}

// 修改 AI 分析函数
async function analyzeWithAI(data) {
  try {
    console.log('开始调用 AI 分析...');
    const response = await fetch(AI_CONFIG.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AI_CONFIG.apiKey}`
      },
      body: JSON.stringify({
        model: "chatglm_turbo",
        messages: [{
          role: "system",
          content: `作为专业的网络行为分析师，请对用户的浏览数据进行分析。
重点关注以下方面：
1. 工作效率：分析工作相关网站的访问情况
2. 学习情况：评估教育和学习资源的使用
3. 时间管理：分析时间分配的合理性
4. 数字健康：评估上网时间和行为是否健康
5. 安全建议：检查是否访问了不安全或不当网站

请提供专业的分析和建设性的建议。`
        }, {
          role: "user",
          content: data
        }],
        temperature: 0.7,
        request_id: Date.now().toString(),
        stream: false
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API 响应错误:', errorText);
      throw new Error(`API request failed: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log('AI 响应:', result);

    if (result.data && result.data.choices && result.data.choices[0]) {
      return result.data.choices[0].content;
    } else {
      throw new Error('Invalid response format from AI service');
    }
  } catch (error) {
    console.error('AI 分析失败:', error);
    throw error;
  }
}

// 初始化数据
async function initializeData() {
  try {
    console.log('初始化数据...');
    const { savedSiteData, savedDailyStats, savedVisitRecords } = 
      await chrome.storage.local.get(['savedSiteData', 'savedDailyStats', 'savedVisitRecords']);
    
    const today = new Date().toDateString();
    
    if (savedDailyStats && savedDailyStats.date === today) {
      console.log('加载今天的数据');
      dailyStats = savedDailyStats;
      siteData = savedSiteData || {};
      visitRecords = savedVisitRecords || [];
    } else {
      console.log('创建新的一天的数据');
      dailyStats = {
        date: today,
        chromeOpenCount: 1,
        totalChromeTime: 0,
        chromeStartTime: Date.now(),
        aiSummary: null,
        summaryGeneratedTime: null
      };
      siteData = {};
      visitRecords = [];
    }

    console.log('初始化后的数据:', {
      dailyStats,
      siteData,
      visitRecords
    });
  } catch (error) {
    console.error('初始化数据失败:', error);
  }
}

// 添加历史数据保存功能
async function saveHistoricalData(stats, sites) {
  try {
    const { history = [] } = await chrome.storage.local.get('history');
    history.push({
      date: stats.date,
      stats: stats,
      sites: sites
    });
    
    // 只保留最近30天的历史
    if (history.length > 30) {
      history.shift();
    }
    
    await chrome.storage.local.set({ history });
  } catch (error) {
    console.error('Error saving historical data:', error);
  }
}

// 更新网站访问时间
async function updateSiteTime(tabId, domain) {
  if (startTime[tabId]) {
    const duration = Date.now() - startTime[tabId];
    
    // 更新网站数据
    if (siteData[domain]) {
      siteData[domain].totalTime += duration;
    }

    // 更新最近的访问记录
    const lastRecord = visitRecords.findLast(record => record.domain === domain);
    if (lastRecord) {
      lastRecord.duration += duration;
    }

    startTime[tabId] = Date.now();
    await saveData();
  }
}

// 修改更新 Chrome 使用时间的函数
function updateChromeTime() {
  if (dailyStats.chromeStartTime) {
    const currentTime = Date.now();
    const timeDiff = Math.floor((currentTime - dailyStats.chromeStartTime) / 1000);
    dailyStats.chromeStartTime = currentTime;
    
    // 累加总时间
    dailyStats.totalChromeTime += timeDiff;
    
    // 确保 Chrome 总时间不小于任何单个网站的时间
    let maxSiteTime = 0;
    Object.values(siteData).forEach(site => {
      maxSiteTime = Math.max(maxSiteTime, site.totalTime / 1000);
    });
    
    dailyStats.totalChromeTime = Math.max(dailyStats.totalChromeTime, maxSiteTime);
  }
}

// 定期更新Chrome使用时间
setInterval(async () => {
  try {
    updateChromeTime();
    
    if (activeTabId) {
      try {
        const tab = await chrome.tabs.get(activeTabId);
        if (tab && tab.url) {
          const url = new URL(tab.url);
          await updateSiteTime(activeTabId, url.hostname);
        }
      } catch (error) {
        // 标签页不存在，清理相关数据
        if (error.message.includes('No tab with id')) {
          delete startTime[activeTabId];
          activeTabId = null;
        } else {
          console.error('Error updating active tab:', error);
        }
      }
    }
    
    await saveData();
  } catch (error) {
    console.error('Error in interval update:', error);
  }
}, 5000); // 每5秒更新一次

// 保存数据
async function saveData() {
  try {
    const dataToSave = {
      savedSiteData: siteData,
      savedDailyStats: dailyStats,
      savedVisitRecords: visitRecords
    };
    
    await chrome.storage.local.set(dataToSave);
    console.log('数据保存成功:', dataToSave);
    
    // 尝试通知 popup 更新
    notifyPopups(dataToSave);
  } catch (error) {
    console.error('保存数据失败:', error);
  }
}

// 添加单独的通知函数
async function notifyPopups(data) {
  try {
    // 检查是否有活动的 popup
    const views = await chrome.extension.getViews({ type: 'popup' });
    if (views && views.length > 0) {
      await chrome.runtime.sendMessage({
        type: 'UPDATE_STATS',
        data: {
          siteData: data.savedSiteData,
          dailyStats: data.savedDailyStats,
          visitRecords: data.savedVisitRecords
        }
      });
    }
  } catch (error) {
    // 忽略 popup 未打开时的连接错误
    if (!error.message.includes('receiving end does not exist') &&
        !error.message.includes('Could not establish connection')) {
      console.error('发送更新消息失败:', error);
    }
  }
}

// 添加数据恢复功能
async function recoverData() {
  try {
    const { savedSiteData, savedDailyStats } = await chrome.storage.local.get(['savedSiteData', 'savedDailyStats']);
    if (savedSiteData && savedDailyStats) {
      siteData = savedSiteData;
      dailyStats = savedDailyStats;
      console.log('Data recovered:', { siteData, dailyStats });
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error recovering data:', error);
    return false;
  }
}

// 发送更新消息给所有popup页面
async function notifyPopups() {
  try {
    // 直接发送消息，让 popup 自己处理
    await chrome.runtime.sendMessage({
      type: 'UPDATE_STATS',
      data: {
        siteData,
        dailyStats
      }
    });
  } catch (error) {
    // 忽略连接错误
    if (!error.message.includes("Receiving end does not exist")) {
      console.error('Error in notifyPopups:', error);
    }
  }
}

// 监听标签页切换
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab && tab.url && !tab.url.startsWith('chrome://')) {
      await addVisitRecord(tab);
      activeTabId = activeInfo.tabId;
      startTime[activeInfo.tabId] = Date.now();
    }
  } catch (error) {
    console.error('标签激活处理错误:', error);
  }
});

// 监听标签页关闭
chrome.tabs.onRemoved.addListener(async (tabId) => {
  try {
    // 清理关闭标签页的数据
    delete startTime[tabId];
    if (activeTabId === tabId) {
      activeTabId = null;
    }
    
    await saveData();
  } catch (error) {
    console.error('Error in onRemoved:', error);
  }
});

// 监听标签页更新
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && !tab.url.startsWith('chrome://')) {
    await addVisitRecord(tab);
    if (tabId === activeTabId) {
      startTime[tabId] = Date.now();
    }
  }
});

// 监听Chrome启动
chrome.runtime.onStartup.addListener(async () => {
  console.log('Chrome 启动');
  await initializeData();
});

// 初始扩展
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('扩展安装/更新:', details.reason);
  await initializeData();
});

// 添加窗口焦点变化监听器
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    // Chrome 失去焦点，更新时间
    updateChromeTime();
    if (activeTabId) {
      const tab = await chrome.tabs.get(activeTabId);
      if (tab && tab.url) {
        const url = new URL(tab.url);
        await updateSiteTime(activeTabId, url.hostname);
      }
    }
    await saveData();
  } else {
    // Chrome 获得焦点，重置开始时间
    dailyStats.chromeStartTime = Date.now();
    if (activeTabId) {
      startTime[activeTabId] = Date.now();
    }
  }
});

// 监听连接
chrome.runtime.onConnect.addListener(function(port) {
  console.log("Connected:", port.name);
  
  port.onMessage.addListener(function(msg) {
    console.log("Message received:", msg);
    // 处理消息
  });
});

// 监听一次性消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("收到消息:", request);
  
  if (request.action === "generateSummary") {
    (async () => {
      try {
        // 获取浏览数据
        const { savedSiteData, savedDailyStats } = await chrome.storage.local.get(['savedSiteData', 'savedDailyStats']);
        
        // 格式化数据用于 AI 分析
        let analysisData = "请根据我今的浏览网页的数据，分析我今天工作做了什么，学了什么，做了什么不正确的事情，健康习惯分析。\n\n";
        analysisData += formatBrowsingDataForAI(savedSiteData, savedDailyStats);
        
        // 调用 AI 分析
        const aiSummary = await analyzeWithAI(analysisData);
        
        // 保存 AI 总结
        dailyStats.aiSummary = aiSummary;
        dailyStats.summaryGeneratedTime = Date.now();
        await saveData();
        
        sendResponse({
          success: true,
          summary: aiSummary
        });
      } catch (error) {
        console.error('Generate summary failed:', error);
        sendResponse({
          success: false,
          error: error.message
        });
      }
    })();
    return true; // 保持消息通道开启
  }
  
  // 处理其他类型的消息
  sendResponse({status: "received"});
  return true;
});

// 添加数据格式化函数
function formatBrowsingDataForAI(siteData, dailyStats) {
  let formattedData = "📊 浏览数据统计：\n\n";
  
  // 基础统计
  formattedData += `总访问网站数：${Object.keys(siteData).length}\n`;
  formattedData += `Chrome使用时间：${Math.round(dailyStats.totalChromeTime / 60)}分钟\n\n`;
  
  // 详细访问记录
  formattedData += "详细访问记录：\n";
  Object.entries(siteData)
    .sort((a, b) => b[1].totalTime - a[1].totalTime)
    .forEach(([domain, data]) => {
      const minutes = Math.round(data.totalTime / 1000 / 60);
      formattedData += `\n${data.title || domain}\n`;
      formattedData += `• 访问次数：${data.visits}次\n`;
      formattedData += `• 停留时间：${minutes}分钟\n`;
      formattedData += `• 域名：${domain}\n`;
    });
  
  return formattedData;
}

// 修改 generateDailySummary 函数
async function generateDailySummary() {
  try {
    console.log("正在生成总结，当前数据:", { siteData, dailyStats });
    
    if (!siteData || Object.keys(siteData).length === 0) {
      throw new Error('没有可用的浏览数据');
    }

    const prompt = formatBrowsingData(siteData, dailyStats, visitRecords);
    console.log('发送给 AI 的数据:', prompt);

    try {
      const summary = await analyzeWithAI(prompt);
      console.log('AI 分析结果:', summary);

      // 更新 dailyStats
      dailyStats.aiSummary = summary;
      dailyStats.summaryGeneratedTime = Date.now();
      
      // 保存更新后的数据
      await saveData();
      
      return summary;
    } catch (aiError) {
      console.error('AI 分析出错:', aiError);
      throw new Error('AI 分析失败: ' + aiError.message);
    }
  } catch (error) {
    console.error('生成总结时出错:', error);
    throw error;
  }
}

// 修改数据格式化部分
function formatBrowsingData(siteData, dailyStats, visitRecords) {
  let prompt = "请分析以下网络浏览数据，重点关注数字健康和网络安全：\n\n";
  
  // 添加基础统计
  prompt += "📊 基础统计：\n";
  prompt += `• 访问网站数：${Object.keys(siteData).length}\n`;
  const totalVisits = Object.values(siteData).reduce((sum, site) => sum + site.visits, 0);
  prompt += `• 总访问次数：${totalVisits}\n`;
  prompt += `• Chrome启动次数：${dailyStats.chromeOpenCount}\n`;
  prompt += `• 总使用时间：${Math.round(dailyStats.totalChromeTime / 60)}分钟\n\n`;

  // 检查网站安全性
  const unsafeVisits = visitRecords.filter(record => 
    checkContentSafety(record.url, record.title)
  );

  if (unsafeVisits.length > 0) {
    prompt += "⚠️ 安全提示：\n";
    prompt += `发现 ${unsafeVisits.length} 次可能的不安全网站访问。\n\n`;
  }

  // 添加详细访问记录
  prompt += "🔍 详细访问记录：\n";
  visitRecords.forEach(record => {
    const minutes = Math.round(record.duration / 1000 / 60);
    const time = new Date(record.timestamp).toLocaleTimeString();
    prompt += `\n${record.title || record.url}\n`;
    prompt += `• 访问时间：${time}\n`;
    prompt += `• 停留时间：${minutes}分钟\n`;
    if (checkContentSafety(record.url, record.title)) {
      prompt += `• 注意：该网站可能存在安全风险\n`;
    }
  });

  return prompt;
}

// 添加获取主域名的函数
function getMainDomain(url) {
  try {
    const hostname = new URL(url).hostname;
    const parts = hostname.split('.');
    if (parts.length > 2) {
      // 处理类似 xxx.baidu.com 的情况
      return parts.slice(-2).join('.');
    }
    return hostname;
  } catch (error) {
    console.error('解析域名错误:', error);
    return url;
  }
}

// 修改添加网站数据的函数
async function addVisitRecord(tab) {
  if (!tab || !tab.url || tab.url.startsWith('chrome://')) return;

  try {
    const url = new URL(tab.url);
    const domain = url.hostname;
    const timestamp = Date.now();

    // 添加访问记录
    const record = {
      id: `visit_${timestamp}`,
      url: tab.url,
      title: tab.title || url.toString(),
      domain: domain,
      timestamp: timestamp,
      duration: 0
    };
    
    visitRecords.push(record);
    console.log('添加新的访问记录:', record);

    // 更新网站数据
    if (!siteData[domain]) {
      siteData[domain] = {
        totalTime: 0,
        visits: 0,
        title: tab.title,
        lastVisit: timestamp
      };
    }
    
    siteData[domain].visits++;
    siteData[domain].lastVisit = timestamp;
    siteData[domain].title = tab.title;

    await saveData();
  } catch (error) {
    console.error('添加访问记录失败:', error);
  }
}