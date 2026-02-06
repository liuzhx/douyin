# 旅游直播间AI助手

智能旅游直播间助手系统，支持：
- 🎙️ 自动播放景点讲解（AI语音合成）
- 💬 实时监听弹幕并智能问答
- 🔊 自然流畅的语音交互体验

## 系统架构

```
[抖音直播间弹幕] 
    ↓
[DouyinBarrageGrab] → WebSocket服务
    ↓
[AI助手核心服务]
    ├─ 弹幕监听模块
    ├─ 景点讲解模块 (Seed-TTS 2.0)
    ├─ 智能问答模块 (Doubao-Realtime)
    └─ 音频播放模块
    ↓
[OBS/直播伴侣] → 推送到直播间
```

## 环境要求

- **操作系统**: Windows 10/11
- **Node.js**: v16.0.0 或更高
- **DouyinBarrageGrab**: [下载地址](https://gitee.com/haodong108/dy-barrage-grab/releases)

## 快速开始

### 1. 安装依赖

```bash
npm install
```

> 💡 **Windows 用户**: 请查看 [Windows 安装指南](docs/WINDOWS_INSTALL_GUIDE.md) 获取详细步骤

### 2. 配置API密钥

编辑 `config/default.json`，填入您的火山引擎API密钥：

```json
{
  "doubao": {
    "appId": "你的APP_ID",
    "accessToken": "你的ACCESS_TOKEN"
  },
  "seedTts": {
    "accessToken": "你的TTS_ACCESS_TOKEN"
  }
}
```

**获取方式**：
1. 访问 [火山引擎控制台](https://console.volcengine.com/)
2. 开通 **Doubao-Realtime** 和 **Seed-TTS 2.0** 服务
3. 在控制台获取 APP ID 和 Access Token

### 3. 启动DouyinBarrageGrab

1. 以**管理员身份**运行 `WssBarrageService.exe`
2. 安装自签名证书（首次运行时提示）
3. 确认控制台显示 WebSocket 服务地址: `ws://127.0.0.1:8888`

### 4. 准备景点讲解词

将景点讲解词JSON文件放入 `data/scripts/` 目录：

```
data/scripts/
├── spot-01-故宫.json
├── spot-02-长城.json
└── spot-03-颐和园.json
```

参考 `spot-script-example.json` 格式创建讲解词。

### 5. 启动AI助手

```bash
npm start
```

### 6. 测试

1. 打开浏览器访问任意抖音直播间
2. 观察控制台日志，确认弹幕监听正常
3. 在直播间发送测试问题："故宫门票多少钱？"
4. 确认系统语音回答

## 项目结构

```
douyin-live-ai-assistant/
├── package.json
├── config/
│   └── default.json          # 配置文件
├── src/
│   ├── index.js              # 主程序入口
│   ├── modules/
│   │   ├── barrage-listener.js    # 弹幕监听
│   │   ├── spot-narrator.js       # 景点讲解
│   │   ├── qa-engine.js           # 问答引擎
│   │   ├── voice-synthesizer.js   # 语音合成
│   │   └── audio-player.js        # 音频播放
│   └── utils/
│       ├── logger.js              # 日志工具
│       └── question-detector.js   # 问题检测
├── data/
│   └── scripts/                   # 景点讲解词
└── logs/                          # 运行日志
```

## 功能说明

### 自动景点讲解

- 默认每5分钟自动播放一段讲解
- 支持顺序/随机播放模式
- 使用 Seed-TTS 2.0 生成高质量语音

配置项（`config/default.json`）：
```json
{
  "narrator": {
    "mode": "sequential",      // 顺序模式: sequential, 随机: random
    "intervalMinutes": 5,      // 讲解间隔(分钟)
    "autoStart": true          // 是否自动开始
  }
}
```

### 智能问答

- 实时监听弹幕中的问题
- 优先匹配预设知识库（`qa_knowledge`）
- 无匹配时调用 Doubao-Realtime AI 生成回答
- 10分钟内不重复回答相同问题

**问题检测规则**：
- 包含问号 `?` 或 `?`
- 包含疑问词：怎么、如何、多少、哪里、什么、为什么、吗、呢

### 音频播放优先级

- **高优先级**: 观众问答（即时回复）
- **普通优先级**: 景点讲解（可被问答打断）

## 测试命令

```bash
# 测试弹幕连接
npm run test:barrage

# 测试Seed-TTS语音合成
npm run test:tts

# 测试Doubao-Realtime实时对话
npm run test:realtime
```

## 常见问题

### 1. DouyinBarrageGrab无法连接

**解决方案**：
- 确认以管理员身份运行
- 检查系统代理端口（默认8827）是否被占用
- 尝试启用轮询模式（修改配置文件 `forcePolling: true`）

### 2. 听不到语音输出

**解决方案**：
- 安装虚拟音频设备（推荐 VB-Audio Virtual Cable）
- 在OBS中添加音频源，监听虚拟设备
- 检查 Windows 音量设置

### 3. API调用失败

**解决方案**：
- 确认API密钥正确
- 检查网络连接（API需要访问火山引擎服务器）
- 查看 `logs/` 目录下的错误日志

## 开发与调试

启用调试日志：

修改 `config/default.json`：
```json
{
  "logging": {
    "level": "debug"
  }
}
```

## 许可证

MIT License

## 致谢

- [DouyinBarrageGrab](https://github.com/ape-byte/DouyinBarrageGrab) - 抖音弹幕抓取工具
- [火山引擎](https://www.volcengine.com/) - 提供AI语音服务
