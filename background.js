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

// 导入配置
import AI_CONFIG from './config.js';

// 添加 API Key 配置函数
async function setApiKey(key) {
  await chrome.storage.local.set({ 'zhipuApiKey': key });
}

// 获取 API Key
async function getApiKey() {
  const { zhipuApiKey } = await chrome.storage.local.get('zhipuApiKey');
  return zhipuApiKey;
}

// 修改 AI 分析函数
async function analyzeWithAI(data) {
  try {
    const apiKey = await getApiKey();
    if (!apiKey) {
      throw new Error('请先配置智谱 AI 的 API Key');
    }

    const response = await fetch(AI_CONFIG.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "glm-4",
        messages: [{
          role: "system",
          content: "你是一个专业的浏览行为分析师，负责分析用户的网页浏览数据，并提供专业的建议。请从工作效率、学习收获、健康习惯等方面进行分析。"
        }, {
          role: "user",
          content: data
        }],
        temperature: 0.7,
        top_p: 0.9,
        max_tokens: 2000,
        stream: false
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log('AI Response:', result);

    if (result.choices && result.choices[0] && result.choices[0].message) {
      return result.choices[0].message.content;
    } else {
      throw new Error('Invalid response format from AI service');
    }
  } catch (error) {
    console.error('AI analysis failed:', error);
    throw error;
  }
}

// 初始化数据
async function initializeData() {
  try {
    const { savedSiteData, savedDailyStats } = await chrome.storage.local.get(['savedSiteData', 'savedDailyStats']);
    const today = new Date().toDateString();
    
    console.log('Loading saved data:', { savedSiteData, savedDailyStats });  // 调试日志
    
    if (savedDailyStats && savedDailyStats.date === today) {
      dailyStats = savedDailyStats;
    } else {
      // 如果是新的一天，保存昨天的数据到历史记录
      if (savedDailyStats && savedSiteData) {
        await saveHistoricalData(savedDailyStats, savedSiteData);
      }
      
      dailyStats = {
        date: today,
        chromeOpenCount: 1,
        totalChromeTime: 0,
        chromeStartTime: Date.now(),
        aiSummary: null,
        summaryGeneratedTime: null
      };
    }
    
    // 如果是同一天，恢复网站数据
    if (savedSiteData && savedDailyStats?.date === today) {
      siteData = savedSiteData;
    } else {
      siteData = {};
    }

    await saveData();
    console.log('Data initialized:', { dailyStats, siteData });  // 调试日志
  } catch (error) {
    console.error('Error in initializeData:', error);
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
    if (siteData[domain]) {
      siteData[domain].totalTime = (siteData[domain].totalTime || 0) + duration;
    }
    startTime[tabId] = Date.now();
    await saveData();
  }
}

// 更新Chrome使用时间
function updateChromeTime() {
  if (dailyStats.chromeStartTime) {
    const currentTime = Date.now();
    const timeDiff = Math.floor((currentTime - dailyStats.chromeStartTime) / 1000);
    dailyStats.totalChromeTime += timeDiff;
    dailyStats.chromeStartTime = currentTime;
  }
}

// 定期更新Chrome使用时间
setInterval(async () => {
  try {
    updateChromeTime();
    
    if (activeTabId) {
      const tab = await chrome.tabs.get(activeTabId);
      if (tab && tab.url) {
        const url = new URL(tab.url);
        await updateSiteTime(activeTabId, url.hostname);
      }
    }
    
    await saveData();
    notifyPopups();
  } catch (error) {
    console.error('Error in interval update:', error);
  }
}, 5000); // 每5秒更新一次

// 保存数据
async function saveData() {
  try {
    const dataToSave = {
      savedSiteData: siteData,
      savedDailyStats: dailyStats
    };
    
    await chrome.storage.local.set(dataToSave);
    console.log('Data saved successfully:', dataToSave);  // 调试日志
  } catch (error) {
    console.error('Error saving data:', error);
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
    // 更新之前活动标签的时间
    if (activeTabId) {
      const oldTab = await chrome.tabs.get(activeTabId);
      if (oldTab && oldTab.url) {
        const oldUrl = new URL(oldTab.url);
        await updateSiteTime(activeTabId, oldUrl.hostname);
      }
    }

    // 更新新的活动标签
    activeTabId = activeInfo.tabId;
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab && tab.url) {
      const url = new URL(tab.url);
      const domain = url.hostname;
      
      startTime[activeInfo.tabId] = Date.now();
      
      if (!siteData[domain]) {
        siteData[domain] = {
          totalTime: 0,
          visits: 0,
          title: tab.title,
          lastVisit: Date.now()
        };
      }
      siteData[domain].visits++;
      siteData[domain].lastVisit = Date.now();
      
      await saveData();
      notifyPopups();
    }
  } catch (error) {
    console.error('Error in onActivated:', error);
  }
});

// 监听标签页关闭
chrome.tabs.onRemoved.addListener(async (tabId) => {
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (startTime[tab.id]) {
        if (tab.url) {
          const url = new URL(tab.url);
          await updateSiteTime(tab.id, url.hostname);
        }
      }
    }
    delete startTime[tabId];
    await saveData();
    notifyPopups();
  } catch (error) {
    console.error('Error in onRemoved:', error);
  }
});

// 监听标签页更新
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    try {
      const url = new URL(tab.url);
      const domain = url.hostname;
      
      if (!siteData[domain]) {
        siteData[domain] = {
          totalTime: 0,
          visits: 0,
          title: tab.title,
          lastVisit: Date.now()
        };
      }
      
      // 如果是当前活动标签，更新开始时间
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTab && activeTab.id === tabId) {
        startTime[tabId] = Date.now();
      }
      
      siteData[domain].visits++;
      siteData[domain].lastVisit = Date.now();
      siteData[domain].title = tab.title; // 更新标题
      
      await saveData();
      notifyPopups();
    } catch (error) {
      console.error('Error in onUpdated:', error);
    }
  }
});

// 监听Chrome启动
chrome.runtime.onStartup.addListener(async () => {
  console.log('Chrome started');
  await initializeData();
  dailyStats.chromeOpenCount++;
  dailyStats.chromeStartTime = Date.now();
  await saveData();
});

// 初始扩展
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('Extension installed/updated:', details.reason);
  if (details.reason === 'install') {
    await initializeData();
  } else if (details.reason === 'update') {
    const recovered = await recoverData();
    if (!recovered) {
      await initializeData();
    }
  }
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
        let analysisData = "请根据我今天的浏览网页的数据，分析我今天工作做了什么，学了什么，做了什么不正确的事情，健康习惯分析。\n\n";
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

    // 准备发送给 AI 的数据
    let prompt = "请根据我今天的浏览网页的数据，分析我今天工作做了什么，学了什么，做了什么不正确的事情，健康习惯分析。\n\n";
    
    // ��加基础统计
    prompt += "基础统计：\n";
    prompt += `• 访问网站数：${Object.keys(siteData).length}\n`;
    const totalVisits = Object.values(siteData).reduce((sum, site) => sum + site.visits, 0);
    prompt += `• 总访问次数：${totalVisits}\n`;
    prompt += `• Chrome启动次数：${dailyStats.chromeOpenCount}\n`;
    prompt += `• 总使用时间：${Math.round(dailyStats.totalChromeTime / 60)}分钟\n\n`;

    // 添加详细访问数据
    prompt += "详细访问记录：\n";
    Object.entries(siteData)
      .sort((a, b) => b[1].totalTime - a[1].totalTime)
      .forEach(([domain, data]) => {
        const minutes = Math.round(data.totalTime / 1000 / 60);
        prompt += `\n${data.title || domain}\n`;
        prompt += `• 访问次数：${data.visits}次\n`;
        prompt += `• 停留时间：${minutes}分钟\n`;
        prompt += `• 域名：${domain}\n`;
      });

    // 调用智谱 AI 进行分析
    const summary = await analyzeWithAI(prompt);

    // 更新 dailyStats
    dailyStats.aiSummary = summary;
    dailyStats.summaryGeneratedTime = Date.now();
    
    // 保存更新后的数据
    await saveData();
    
    console.log("AI 总结生成完成:", summary);
    return summary;

  } catch (error) {
    console.error('生成总结时出错:', error);
    throw error;
  }
}