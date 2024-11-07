// 智谱AI配置
const AI_CONFIG = {
  // API 端点配置
  endpoint: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
  apiKey: "YOUR_API_KEY", // 替换为你的智谱AI API Key
  
  // 模型参数配置
  model: "chatglm_turbo", // 默认模型
  temperature: 0.7, // 温度参数,控制响应的随机性
  maxTokens: 2048, // 最大token数
  
  // 请求配置
  timeout: 30000, // 请求超时时间(毫秒)
  retries: 3, // 失败重试次数
  
  // 系统配置
  debug: false, // 是否开启调试模式
  version: "1.0.0" // 配置文件版本
};

export default AI_CONFIG; 