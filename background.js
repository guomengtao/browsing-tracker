let startTime = {};
let activeTabId = null;
let siteData = {};
let visitRecords = [];
let dailyStats = {
  date: new Date().toDateString(),
  chromeOpenCount: 0,
  totalChromeTime: 0,
  chromeStartTime: null,
  aiSummary: null,
  summaryGeneratedTime: null,
  totalVisits: 0
};

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
    
    // 构建请求体
    const requestBody = {
      model: "glm-4",  // 使用 glm-4 模型
      messages: [{
        role: "system",
        content: "你是一个专业的网络行为分析师，负责分析用户的浏览数据并提供专业的建议。"
      }, {
        role: "user",
        content: data
      }],
      temperature: 0.7,
      top_p: 0.7,
      stream: false
    };

    console.log('请求体:', requestBody);

    const response = await fetch(AI_CONFIG.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AI_CONFIG.apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API 响应错误:', errorText);
      throw new Error(`API 请求失败: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log('AI 原始响应:', result);

    // 智谱 AI 的响应格式处理
    if (result && result.data && result.data.choices && result.data.choices[0]) {
      return result.data.choices[0].content;
    } else if (result && result.choices && result.choices[0] && result.choices[0].message) {
      return result.choices[0].message.content;
    }
    
    console.error('无效的响应格式:', result);
    throw new Error('AI 服务返回了无效的响应格式');
  } catch (error) {
    console.error('AI 分析失败:', error);
    throw new Error(`AI 分析失败: ${error.message}`);
  }
}

// 修改保存数据函数
async function saveData(newSiteData, newVisitRecords, newDailyStats) {
  try {
    // 更新内存中的数据
    if (newSiteData) siteData = newSiteData;
    if (newVisitRecords) visitRecords = newVisitRecords;
    if (newDailyStats) dailyStats = newDailyStats;

    // 获取当前日期
    const today = new Date().toDateString();
    
    // 获取历史数据
    const { history = [] } = await chrome.storage.local.get('history');
    console.log('获取到的历史数据:', history);
    
    // 保存当前数据
    const currentData = {
      savedSiteData: siteData,
      savedVisitRecords: visitRecords,
      savedDailyStats: dailyStats,
      lastSaveTime: Date.now()
    };

    // 创建今天的数据记录
    const todayData = {
      date: today,
      stats: { ...dailyStats },
      sites: { ...siteData },
      visitRecords: [...visitRecords],
      aiSummary: dailyStats.aiSummary ? {
        content: dailyStats.aiSummary,
        generateTime: dailyStats.summaryGeneratedTime
      } : null
    };

    // 更新或添加今天的数据到历史记录
    const todayIndex = history.findIndex(item => item.date === today);
    if (todayIndex >= 0) {
      history[todayIndex] = todayData;
    } else {
      history.push(todayData);
    }

    // 按日期排序
    history.sort((a, b) => new Date(b.date) - new Date(a.date));

    // 保留最近30天的历史
    const recentHistory = history.slice(0, 30);

    // 一次性保存所有数据
    await chrome.storage.local.set({
      ...currentData,
      history: recentHistory
    });

    console.log('保存的数据:', {
      currentData,
      historyLength: recentHistory.length,
      latestHistoryDate: recentHistory[0]?.date
    });
  } catch (error) {
    console.error('保存数据失败:', error);
    throw error;
  }
}

// 添加获取历史数据的函数
async function getHistoryData(date) {
  try {
    const { history = [] } = await chrome.storage.local.get('history');
    return history.find(item => item.date === date) || null;
  } catch (error) {
    console.error('获取历史数据失败:', error);
    return null;
  }
}

// 添加重置数据的函数
async function resetData() {
  await saveData({}, [], null, true);
}

// 从 storage 加载数据
async function loadData() {
  try {
    const {
      savedSiteData,
      savedVisitRecords,
      savedDailyStats,
      lastSaveTime
    } = await chrome.storage.local.get([
      'savedSiteData',
      'savedVisitRecords',
      'savedDailyStats',
      'lastSaveTime'
    ]);

    // 如果是新的一天，重置数据
    const today = new Date().toDateString();
    const lastSaveDay = lastSaveTime ? new Date(lastSaveTime).toDateString() : null;

    if (today !== lastSaveDay) {
      console.log('新的一天，重置数据');
      const newData = {
        siteData: {},
        visitRecords: [],
        dailyStats: {
          chromeOpenCount: 0,
          totalChromeTime: 0,
          totalVisits: 0,
          date: today
        }
      };
      await saveData(newData.siteData, newData.visitRecords, newData.dailyStats);
      return newData;
    }

    // 使用存储中的数据，如果不存在则使用空数据
    return {
      siteData: savedSiteData || {},
      visitRecords: savedVisitRecords || [],
      dailyStats: savedDailyStats || {
        chromeOpenCount: 0,
        totalChromeTime: 0,
        totalVisits: 0,
        date: today
      }
    };
  } catch (error) {
    console.error('加载数据失败:', error);
    return {
      siteData: {},
      visitRecords: [],
      dailyStats: {
        chromeOpenCount: 0,
        totalChromeTime: 0,
        totalVisits: 0,
        date: new Date().toDateString()
      }
    };
  }
}

// 修改初始化数据函数
async function initializeData() {
  try {
    console.log('开始初始化数据...');
    
    // 获取当前日期
    const today = new Date().toDateString();
    
    // 从 storage 加载数据
    const { savedSiteData, savedVisitRecords, savedDailyStats } = 
      await chrome.storage.local.get(['savedSiteData', 'savedVisitRecords', 'savedDailyStats']);
    
    // 检查是否是新的一天
    const lastSaveDay = savedDailyStats?.date || null;
    
    if (today !== lastSaveDay) {
      console.log('新的一天，重置数据');
      // 重置今天的数据
      siteData = {};
      visitRecords = [];
      dailyStats = {
        date: today,
        chromeOpenCount: 1,
        totalChromeTime: 0,
        chromeStartTime: Date.now(),
        aiSummary: null,
        summaryGeneratedTime: null,
        totalVisits: 0
      };
    } else {
      console.log('使用已保存的数据');
      // 使用已保存的数据
      siteData = savedSiteData || {};
      visitRecords = savedVisitRecords || [];
      dailyStats = savedDailyStats || {
        date: today,
        chromeOpenCount: 1,
        totalChromeTime: 0,
        chromeStartTime: Date.now(),
        aiSummary: null,
        summaryGeneratedTime: null,
        totalVisits: 0
      };
      
      // 增加 Chrome 启动次数
      dailyStats.chromeOpenCount++;
    }
    
    // 设置 Chrome 开始时间
    dailyStats.chromeStartTime = Date.now();
    
    // 保存初始化后的数据
    await saveData(siteData, visitRecords, dailyStats);
    
    console.log('数据初始化完成:', {
      siteData,
      visitRecords,
      dailyStats,
      today,
      lastSaveDay
    });
  } catch (error) {
    console.error('初始化数据失败:', error);
  }
}

// 定期保存数据（每分钟）
setInterval(() => {
  saveData(siteData, visitRecords, dailyStats);
}, 60000);

// 在接收到删除消息时更新数据
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'DATA_UPDATED') {
    console.log('收到数据更新消息:', message.data);
    
    // 立即保存更新后的数据
    saveData(
      message.data.savedSiteData,
      message.data.savedVisitRecords,
      message.data.savedDailyStats,
      true  // 强制重置
    ).then(() => {
      sendResponse({ success: true });
    }).catch(error => {
      console.error('更新数据失败:', error);
      sendResponse({ success: false, error: error.message });
    });
    
    return true;
  } else if (message.type === 'RESET_DATA') {
    resetData().then(() => {
      sendResponse({ success: true });
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
});

// 在扩展关闭前保存数据
chrome.runtime.onSuspend.addListener(() => {
  saveData(siteData, visitRecords, dailyStats);
});

// 添加历史据保存功能
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
      siteData[domain].lastVisit = Date.now();
    } else {
      const tab = await chrome.tabs.get(tabId);
      siteData[domain] = {
        totalTime: duration,
        visits: 1,
        title: tab.title,
        lastVisit: Date.now()
      };
    }

    // 更新最近的访问记录
    const lastRecord = visitRecords.findLast(record => record.domain === domain);
    if (lastRecord) {
      lastRecord.duration += duration;
    }

    startTime[tabId] = Date.now();
    await saveData(siteData, visitRecords, dailyStats);
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
        // 标签不存在，清理相关数据
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

// 添加单独的通知函数
async function notifyPopups(data) {
  try {
    const views = chrome.extension.getViews({ type: 'popup' });
    if (views && views.length > 0) {
      for (const view of views) {
        if (view.updateDisplay) {
          view.updateDisplay(data);
        }
      }
    }
  } catch (error) {
    console.error('通知 popup 失败:', error);
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
    // 直接发送消息， popup 自己处理
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

// 添加 IndexedDB 数据库操作
const DB_NAME = 'BrowsingAnalyticsDB';
const DB_VERSION = 1;
const STORE_NAME = 'aiSummaries';

// 初始化数据库
async function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      // 创建存储 AI 总结的对象仓库
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'date' });
        store.createIndex('generateTime', 'generateTime');
      }
    };
  });
}

// 保存 AI 总结到 IndexedDB
async function saveAISummary(summary) {
  try {
    const db = await initDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    
    const summaryData = {
      date: new Date().toDateString(),
      content: summary,
      generateTime: Date.now(),
      siteData: siteData,
      dailyStats: dailyStats
    };
    
    await store.put(summaryData);
    console.log('AI 总结已保存到数据库');
    
    return summaryData;
  } catch (error) {
    console.error('保存 AI 总结失败:', error);
    throw error;
  }
}

// 获取今日的 AI 总结
async function getTodayAISummary() {
  try {
    const db = await initDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    
    const today = new Date().toDateString();
    const request = store.get(today);
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('获取 AI 总结失败:', error);
    throw error;
  }
}

// 修改消息监听器
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "generateSummary") {
    // 使用 Promise.resolve().then() 来处理异步操作
    Promise.resolve().then(async () => {
      try {
        console.log('开始生成总结...');
        
        // 获取当前内存中的数据
        if (!siteData || Object.keys(siteData).length === 0) {
          throw new Error('没有可用的浏览数据');
        }
        
        // 格式化数据
        const analysisData = formatBrowsingDataForAI(siteData, dailyStats);
        console.log('发送给 AI 的数据:', analysisData);
        
        // 调用 AI 分析
        const aiSummary = await analyzeWithAI(analysisData);
        console.log('AI 分析结果:', aiSummary);
        
        // 保存到 storage
        const summaryData = {
          content: aiSummary,
          generateTime: Date.now(),
          date: new Date().toDateString()
        };
        
        await chrome.storage.local.set({ aiSummary: summaryData });
        
        // 更新 dailyStats
        dailyStats.aiSummary = aiSummary;
        dailyStats.summaryGeneratedTime = summaryData.generateTime;
        
        // 保存更新后的数据
        await saveData(siteData, visitRecords, dailyStats);
        
        // 返回结果
        sendResponse({
          success: true,
          summary: aiSummary
        });
      } catch (error) {
        console.error('生成总结失败:', error);
        sendResponse({
          success: false,
          error: error.message
        });
      }
    });
    
    return true; // 保持消息通道开启
  } else if (request.action === "getTodayAISummary") {
    Promise.resolve().then(async () => {
      try {
        const { aiSummary } = await chrome.storage.local.get('aiSummary');
        if (aiSummary && aiSummary.date === new Date().toDateString()) {
          sendResponse({
            success: true,
            summary: aiSummary
          });
        } else {
          sendResponse({
            success: false,
            error: '没有今日的 AI 总结'
          });
        }
      } catch (error) {
        console.error('获取 AI 总结失败:', error);
        sendResponse({
          success: false,
          error: error.message
        });
      }
    });
    
    return true; // 保持消息通道开启
  } else if (request.type === 'DATA_UPDATED') {
    Promise.resolve().then(async () => {
      try {
        await saveData(
          request.data.savedSiteData,
          request.data.savedVisitRecords,
          request.data.savedDailyStats
        );
        sendResponse({ success: true });
      } catch (error) {
        console.error('更新数据失败:', error);
        sendResponse({ success: false, error: error.message });
      }
    });
    
    return true; // 保持消息通道开启
  }
  
  return false;
});

// 修改格式化数据的函数
function formatBrowsingDataForAI(siteData, dailyStats) {
  let formattedData = "请分析以下今日的浏览数据，给出具体的分析和建议：\n\n";
  
  // 基础统计
  formattedData += "基础数据：\n";
  formattedData += `- 访问网站数：${Object.keys(siteData).length}个\n`;
  formattedData += `- Chrome使用时长：${Math.round(dailyStats.totalChromeTime / 60)}分钟\n`;
  formattedData += `- Chrome启动次数：${dailyStats.chromeOpenCount}次\n\n`;
  
  // 详细访问记录
  formattedData += "访问详情：\n";
  Object.entries(siteData)
    .sort((a, b) => b[1].totalTime - a[1].totalTime)
    .forEach(([domain, data]) => {
      const minutes = Math.round(data.totalTime / 1000 / 60);
      formattedData += `\n网站：${data.title || domain}\n`;
      formattedData += `访问：${data.visits}次，时长：${minutes}分钟\n`;
    });

  formattedData += "\n请分析：\n";
  formattedData += "1. 工作效率情况\n";
  formattedData += "2. 时间分配合理性\n";
  formattedData += "3. 使用习惯建议\n";
  
  return formattedData;
}

// 修改生成总结的处理函数
async function generateDailySummary() {
  try {
    console.log("开始生成总结，当前数据:", { siteData, dailyStats });
    
    if (!siteData || Object.keys(siteData).length === 0) {
      throw new Error('没有可用的浏览数据');
    }

    const prompt = formatBrowsingDataForAI(siteData, dailyStats);
    console.log('发送给 AI 的数据:', prompt);

    const summary = await analyzeWithAI(prompt);
    console.log('AI 分析结果:', summary);

    // 保存 AI 总结
    dailyStats.aiSummary = summary;
    dailyStats.summaryGeneratedTime = Date.now();
    
    await saveData(siteData, visitRecords, dailyStats);
    
    return summary;
  } catch (error) {
    console.error('生成总结失败:', error);
    throw error;
  }
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

    // 保存更新后的数据
    await saveData(siteData, visitRecords, dailyStats);
    
    console.log('添加新的访问记录:', record);
  } catch (error) {
    console.error('添加访问记录失败:', error);
  }
}