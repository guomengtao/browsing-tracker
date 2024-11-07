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
          content: `你是一个专业的浏览行为分析师，请根据用户的浏览数据进行分析。
分析维度包括：
1. 工作内容：根据访问的网站推测今天的工作内容
2. 学习收获：分析是否访问了学习相关网站，学到了什么
3. 时间管理：分析时间分配是否合理
4. 健康建议：根据使用时长和时间分布给出健康建议
请用简洁专业的语言进行分析，给出具体的改进建议。`
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

    const responseText = await response.text();
    console.log('原始响应:', responseText);

    try {
      const result = JSON.parse(responseText);
      console.log('解析后的响应:', result);

      // 处理不同的响应格式
      if (result.data && result.data.choices && result.data.choices[0]) {
        return result.data.choices[0].content;
      } else if (result.choices && result.choices[0]) {
        if (result.choices[0].message) {
          return result.choices[0].message.content;
        }
        return result.choices[0].content;
      } else if (result.response) {
        return result.response;
      } else {
        console.error('无法解析的响应格式:', result);
        throw new Error('无法识别的 AI 响应格式');
      }
    } catch (parseError) {
      console.error('解析响应时出错:', parseError);
      console.error('原始响应内容:', responseText);
      throw new Error('解析 AI 响应失败: ' + parseError.message);
    }
  } catch (error) {
    console.error('AI 分析失败:', error);
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

    const prompt = formatBrowsingData(siteData, dailyStats);
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
function formatBrowsingData(siteData, dailyStats) {
  let prompt = "请分析以下浏览数据，从工作内容、学习收获、时间管理和健康习惯等方面给出专业建议：\n\n";
  
  // 添加基础统计
  prompt += "📊 基础统计：\n";
  prompt += `• 访问网站数：${Object.keys(siteData).length}\n`;
  const totalVisits = Object.values(siteData).reduce((sum, site) => sum + site.visits, 0);
  prompt += `• 总访问次数：${totalVisits}\n`;
  prompt += `• Chrome启动次数：${dailyStats.chromeOpenCount}\n`;
  prompt += `• 总使用时间：${Math.round(dailyStats.totalChromeTime / 60)}分钟\n\n`;

  // 添加详细访问数据
  prompt += "🔍 详细访问记录：\n";
  Object.entries(siteData)
    .sort((a, b) => b[1].totalTime - a[1].totalTime)
    .forEach(([domain, data]) => {
      const minutes = Math.round(data.totalTime / 1000 / 60);
      const lastVisitTime = new Date(data.lastVisit).toLocaleTimeString();
      prompt += `\n${data.title || domain}\n`;
      prompt += `• 访问次数：${data.visits}次\n`;
      prompt += `• 停留时间：${minutes}分钟\n`;
      prompt += `• 最后访问：${lastVisitTime}\n`;
      prompt += `• 域名：${domain}\n`;
    });

  // 添加时间分布分析
  prompt += "\n⏰ 时间分布分析：\n";
  const timeDistribution = {
    morning: 0,   // 5:00-12:00
    afternoon: 0, // 12:00-18:00
    evening: 0    // 18:00-次日5:00
  };

  Object.values(siteData).forEach(data => {
    const hour = new Date(data.lastVisit).getHours();
    if (hour >= 5 && hour < 12) timeDistribution.morning++;
    else if (hour >= 12 && hour < 18) timeDistribution.afternoon++;
    else timeDistribution.evening++;
  });

  prompt += `• 上午 (5:00-12:00): ${timeDistribution.morning} 次访问\n`;
  prompt += `• 下午 (12:00-18:00): ${timeDistribution.afternoon} 次访问\n`;
  prompt += `• 晚上 (18:00-次日5:00): ${timeDistribution.evening} 次访问\n`;

  return prompt;
}