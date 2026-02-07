# Seed-TTS WebSocket 配置指南

## 🎯 问题解决方案

火山引擎 Seed-TTS **不使用 HTTP API**，而是使用 **WebSocket bidirection** 协议！

### ✅ 已修复的问题

原来的500错误是因为使用了错误的API端点和协议：
- ❌ 旧方式：`https://openspeech.bytedance.com/api/v3/tts/submit` (HTTP POST)
- ✅ 新方式：`wss://openspeech.bytedance.com/api/v3/tts/bidirection` (WebSocket)

## 📝 配置步骤

### 1. 更新配置文件

编辑 `config/default.json`:

```json
{
  "seedTts": {
    "wsUrl": "wss://openspeech.bytedance.com/api/v3/tts/bidirection",
    "appId": "你的_APP_ID",
    "accessToken": "你的_ACCESS_TOKEN",
    "voiceType": "zh_female_tianmeitaozi_mars_bigtts",
    "resourceId": "auto"
  }
}
```

**重要说明**：
- `appId`：即 X-Api-App-Key，通常与 `doubao.appId` 相同
- `accessToken`：即 X-Api-Access-Key
- `resourceId`：设置为 "auto" 会自动根据 voiceType 判断

### 2. 安装依赖

```bash
npm install uuid
```

### 3. 测试连接

```bash
npm run test:tts:ws
```

## 🔑 如何获取配置

### 方法1: 从火山引擎控制台获取

1. 访问 [火山引擎控制台](https://console.volcengine.com)
2. 进入 "语音合成" 或 "豆包大模型" 服务
3. 在 "密钥管理" 或 "API Keys" 中找到：
   - **App ID** (应用ID)
   - **Access Token** / **Access Key** (访问密钥)

### 方法2: 使用已有的 doubao 配置

如果你已经配置了 doubao AI 服务，可以复用相同的凭证：

```json
{
  "doubao": {
    "appId": "abc123xyz",
    "accessToken": "your-token-here",
    ...
  },
  "seedTts": {
    "wsUrl": "wss://openspeech.bytedance.com/api/v3/tts/bidirection",
    "appId": "abc123xyz",  // 与 doubao.appId 相同
    "accessToken": "your-token-here",  // 与 doubao.accessToken 相同
    "voiceType": "zh_female_tianmeitaozi_mars_bigtts",
    "resourceId": "auto"
  }
}
```

## 🎤 可用的语音类型（voiceType）

常用中文语音：
- `zh_female_tianmeitaozi_mars_bigtts` - 女声（甜美桃子）⭐ 推荐
- `zh_male_wennuanahu_mars_bigtts` - 男声（温暖阿虎）
- `zh_female_xinlingxiaoyuan_mars_bigtts` - 女声（心灵小媛）

查看更多：[火山引擎语音列表文档](https://www.volcengine.com/docs/6561/1329505)

## 🔧 Resource ID 说明

`resourceId` 字段决定使用哪个TTS引擎：

- **"auto"** - 自动判断（推荐）
  - 如果 voiceType 以 `S_` 开头 → 使用 `volc.megatts.default`
  - 否则 → 使用 `volc.service_type.10029`

- **手动指定**：
  - `volc.megatts.default` - Mega TTS 引擎
  - `volc.service_type.10029` - 标准 TTS 引擎

## 📊 新旧实现对比

| 特性 | 旧实现 (HTTP) | 新实现 (WebSocket) |
|------|---------------|-------------------|
| **协议** | HTTPS POST | WSS WebSocket |
| **端点** | /api/v3/tts/submit | /api/v3/tts/bidirection |
| **认证** | Bearer Token | X-Api-Access-Key |
| **格式** | JSON | 二进制协议 |
| **状态** | ❌ 500错误 | ✅ 正常工作 |

## 🚀 使用方式

### 在代码中使用

```javascript
const VoiceSynthesizerWebSocket = require('./src/modules/voice-synthesizer-websocket');

const synthesizer = new VoiceSynthesizerWebSocket();

// 连接
await synthesizer.connect();

// 合成语音
const audioData = await synthesizer.synthesize('你好，世界！', {
    encoding: 'mp3',
    sampleRate: 24000
});

// audioData 是 Buffer，包含 MP3 音频数据
fs.writeFileSync('output.mp3', audioData);

// 断开
await synthesizer.disconnect();
```

### 集成到现有项目

如果你想替换旧的 `voice-synthesizer.js`：

```javascript
// 在 src/index.js 或其他入口文件中
// const VoiceSynthesizer = require('./modules/voice-synthesizer');
const VoiceSynthesizer = require('./modules/voice-synthesizer-websocket');
```

## ⚠️ 故障排查

### 问题1: 连接失败

**错误**: `WebSocket connection failed`

**解决**:
1. 检查网络连接
2. 确认 appId 和 accessToken 正确
3. 检查防火墙是否阻止 WebSocket

### 问题2: 认证失败

**错误**: `401 Unauthorized` 或 `403 Forbidden`

**解决**:
1. 确认 appId 正确（不是 Access Token）
2. 确认 accessToken 没有过期
3. 确认账户已开通 TTS 服务

### 问题3: Resource ID 错误

**错误**: `Resource ID mismatch`

**解决**:
将 `resourceId` 设置为 `"auto"`，让系统自动选择

### 问题4: 没有音频返回

**检查**:
1. 查看日志中是否有 "AudioOnlyServer" 消息
2. 确认文本不为空
3. 尝试更简单的文本，如 "你好"

## 📚 更多信息

- [火山引擎 TTS 官方文档](https://www.volcengine.com/docs/6561/1329505)
- [GitHub Issues](你的项目地址/issues)

## ✅ 完成检查清单

- [ ] 已更新 config/default.json
- [ ] appId 和 accessToken 已正确配置
- [ ] 运行 `npm install uuid` 安装依赖
- [ ] 运行 `npm run test:tts:ws` 测试成功
- [ ] 音频文件已成功生成

🎉 **配置完成！现在可以正常使用 Seed-TTS 了！**
