# AI智能答案配置指南

## 🎯 目标

让系统能够调用**豆包实时语音大模型(Doubao-Realtime)**，生成真正的智能答案。

---

## ✅ 已完成的工作

已创建完整的AI服务集成：

1. **新增模块**: [doubao-ai-service.js](file:///Users/zhexianliu/douyin/src/modules/doubao-ai-service.js)
   - 封装Doubao-Realtime API
   - 支持文本输入→AI回答
   - 自动处理会话管理

2. **主程序更新**: [index.js](file:///Users/zhexianliu/douyin/src/index.js)
   - 集成DoubaoAIService
   - 替换模拟AI为真实API调用
   - 添加错误降级处理

---

## 🔧 配置步骤

### 第一步：获取API密钥

1. 访问 [火山引擎控制台](https://console.volcengine.com/ark/)

2. 开通服务：
   - **豆包实时语音大模型** (Doubao-Realtime)
   - 建议同时开通 **Seed-TTS 2.0** 作为备用

3. 获取凭证：
   - `APP ID`: 应用ID
   - `Access Token`: 访问令牌

---

### 第二步：填写配置文件

编辑 [config/default.json](file:///Users/zhexianliu/douyin/config/default.json):

```json
{
  "doubao": {
    "appId": "你的APP_ID",
    "accessToken": "你的ACCESS_TOKEN",
    "realtimeUrl": "wss://openspeech.bytedance.com/api/v3/realtime/dialogue",
    "resourceId": "volc.speech.dialog",
    "appKey": "PlgvMymc7f3tQnJ6"
  }
}
```

> ⚠️ **重要**: `realtimeUrl`、`resourceId`、`appKey` 已预配置正确值，无需修改

---

## 🚀 工作流程

### AI回答生成流程

```
观众提问: "故宫有多大?"
    ↓
1. 检查预设答案 (qa_knowledge)
    ↓ 未找到
2. 调用 DoubaoAIService.askQuestion()
    ↓
3. WebSocket发送到 Doubao-Realtime API
    ↓
4. AI处理:
   - 理解问题
   - 结合当前景点上下文
   - 生成专业导游风格回答
    ↓
5. 接收响应:
   - response.text.delta (文本片段)
   - response.text.done (完整文本)
   - response.audio.delta (语音片段,可选)
    ↓
6. 返回答案文本
    ↓
7. 语音合成 (Seed-TTS)
    ↓
8. 播放到直播间
```

---

## 📝 代码示例

### DoubaoAIService 使用示例

```javascript
const DoubaoAIService = require('./modules/doubao-ai-service');

// 创建服务实例
const aiService = new DoubaoAIService();

// 连接
await aiService.connect();

// 提问
const response = await aiService.askQuestion(
  "故宫有多大?", 
  {
    currentSpot: {
      name: "故宫",
      category: "历史文化"
    }
  }
);

console.log('AI回答:', response.text);
// 输出示例: "故宫占地约72万平方米，是世界上现存规模最大的宫殿建筑群之一..."
```

---

## 🎨 提示词优化

系统会自动构建以下提示词发送给AI：

```
你是一名专业、热情的旅游导游助手。你的职责是回答游客关于景点的问题。

当前景点信息:
- 名称: 故宫
- 分类: 历史文化

回答要求:
1. 语气友好、热情、专业
2. 回答简洁明了，不超过100字
3. 如果不确定答案，诚实告知并建议询问主播
4. 突出景点的特色和亮点

游客问题: 故宫有多大?
```

**位置**: [doubao-ai-service.js:L156-L169](file:///Users/zhexianliu/douyin/src/modules/doubao-ai-service.js#L156-L169)

---

## 🔍 测试验证

### 方法1: 测试脚本

创建测试文件 `tests/test-doubao-ai.js`:

```javascript
const DoubaoAIService = require('../src/modules/doubao-ai-service');
const config = require('config');

async function testDoubaoAI() {
  const aiService = new DoubaoAIService();
  
  try {
    await aiService.connect();
    console.log('✅ 连接成功');
    
    const response = await aiService.askQuestion(
      "故宫门票多少钱?",
      { currentSpot: { name: "故宫", category: "历史文化" } }
    );
    
    console.log('AI回答:', response.text);
    console.log('音频长度:', response.audio ? response.audio.length : '无');
    
  } catch (error) {
    console.error('测试失败:', error.message);
  } finally {
    aiService.disconnect();
  }
}

testDoubaoAI();
```

运行:
```bash
node tests/test-doubao-ai.js
```

### 方法2: 完整系统测试

1. 启动系统: `npm start`
2. 打开抖音直播间
3. 发送问题: "故宫有什么特色?"
4. 观察日志输出:

```
[事件] 收到问题: 故宫有什么特色?
[问答引擎] 未找到预设答案，将调用AI生成
[Doubao AI] 提问: 故宫有什么特色?
[Doubao AI] 收到消息: {"type":"session.created"...}
[Doubao AI] 文本回答完成: 故宫的特色在于...
[Doubao AI] ✅ AI回答完成
[语音合成] Seed-TTS合成: 故宫的特色在于...
[音频播放] 开始播放: qa
```

---

## ⚙️ 高级配置

### 调整超时时间

修改 [doubao-ai-service.js:L140](file:///Users/zhexianliu/douyin/src/modules/doubao-ai-service.js#L140):

```javascript
const timeout = setTimeout(() => {
  reject(new Error('AI回答超时'));
}, 30000); // 默认30秒，可根据需要调整
```

### 自定义提示词

修改 [doubao-ai-service.js:L156-L169](file:///Users/zhexianliu/douyin/src/modules/doubao-ai-service.js#L156-L169) 的 `systemPrompt`:

```javascript
const systemPrompt = `你是一名幽默风趣的旅游导游...`;
```

---

## 🐛 故障排查

### 问题1: 连接失败

**错误信息**: `WebSocket错误: getaddrinfo ENOTFOUND`

**解决方案**:
- 检查网络连接
- 确认API密钥正确
- 检查防火墙设置

### 问题2: 认证失败

**错误信息**: `API错误: Unauthorized`

**解决方案**:
- 确认APP ID和Access Token正确
- 检查服务是否已开通
- 确认账号余额充足

### 问题3: 超时无响应

**错误信息**: `AI回答超时`

**解决方案**:
- 增加超时时间(默认30秒)
- 检查问题复杂度
- 查看日志中的中间消息

---

## 💰 成本估算

**Doubao-Realtime计费方式**:
- 按**对话时长**计费
- 包含ASR + LLM + TTS完整链路
- 具体价格参考 [火山引擎定价](https://www.volcengine.com/pricing)

**优化建议**:
1. 优先使用`qa_knowledge`预设答案(免费)
2. AI仅处理复杂或未预设的问题
3. 设置每日调用上限

---

## 📊 监控与日志

系统会记录所有AI交互：

```
logs/app.log     # 所有日志
logs/error.log   # 仅错误日志
```

关键日志点：
- `[Doubao AI] 提问:` - 发送的问题
- `[Doubao AI] 文本回答完成:` - AI回答
- `[Doubao AI] ✅ AI回答完成` - 成功
- `[AI生成] AI答案生成失败:` - 失败（会降级）

---

## 🎉 完成！

配置完成后，系统将具备**真正的AI智能问答能力**：

✅ 自动理解观众问题  
✅ 结合景点上下文生成专业回答  
✅ 语音播报到直播间  
✅ 错误自动降级  

有任何问题，请查看日志或参考 [walkthrough.md](file:///Users/zhexianliu/.gemini/antigravity/brain/f8f05a30-f1de-4027-bc18-b433af82e428/walkthrough.md)
