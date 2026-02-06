# Windows 安装部署指南

## 📋 系统要求

- **操作系统**: Windows 10/11 (64位)
- **管理员权限**: 需要
- **网络**: 稳定的互联网连接
- **磁盘空间**: 至少 500MB 可用空间

---

## 🛠️ 第一步：安装 Node.js

### 1.1 下载 Node.js

访问 Node.js 官网下载页面：
- 官网: https://nodejs.org/
- 推荐下载: **LTS（长期支持版）** - 当前推荐 v20.x 或更高

### 1.2 安装 Node.js

1. 双击下载的 `.msi` 安装包
2. 点击 "Next" 继续
3. 勾选 "I accept the terms in the License Agreement"
4. **重要**: 确保勾选 "Automatically install the necessary tools"
5. 点击 "Install" 开始安装
6. 等待安装完成，点击 "Finish"

### 1.3 验证安装

打开 **命令提示符** (CMD) 或 **PowerShell**：

```cmd
# 按 Win + R，输入 cmd，回车
```

输入以下命令验证：

```cmd
node -v
```
应该显示类似：`v20.11.0`

```cmd
npm -v
```
应该显示类似：`10.2.4`

✅ 如果都显示版本号，说明 Node.js 安装成功！

---

## 📦 第二步：下载项目代码

### 方法1: Git 克隆（推荐）

如果您已安装 Git：

```cmd
cd C:\
git clone <您的项目仓库地址> douyin-live-ai-assistant
cd douyin-live-ai-assistant
```

### 方法2: 直接下载

1. 将项目代码复制到本地目录，例如：
   ```
   C:\douyin-live-ai-assistant\
   ```

2. 打开命令提示符，进入项目目录：
   ```cmd
   cd C:\douyin-live-ai-assistant
   ```

---

## 📦 第三步：安装项目依赖

在项目目录下执行：

```cmd
npm install
```

> ⏳ 这个过程可能需要 2-5 分钟，请耐心等待

安装完成后应该看到类似信息：
```
added 150 packages in 2m
```

### 常见问题：

**问题1**: 提示 `npm ERR! network`

**解决**：网络问题，切换 npm 镜像源：
```cmd
npm config set registry https://registry.npmmirror.com
npm install
```

**问题2**: 提示 `node-gyp` 错误

**解决**：安装 Windows 构建工具：
```cmd
npm install --global windows-build-tools
```

---

## 🎯 第四步：安装 DouyinBarrageGrab

### 4.1 下载 DouyinBarrageGrab

访问 Gitee 发布页面：
- 地址: https://gitee.com/haodong108/dy-barrage-grab/releases
- 下载最新版本的 `.zip` 文件（**不要下载源码包**）

### 4.2 解压到指定目录

解压到任意位置，例如：
```
C:\DouyinBarrageGrab\
```

解压后目录结构：
```
C:\DouyinBarrageGrab\
├── WssBarrageService.exe  ← 主程序
├── WssBarrageService.exe.config  ← 配置文件
└── 其他文件...
```

### 4.3 首次运行（安装证书）

1. **右键点击** `WssBarrageService.exe`
2. 选择 **"以管理员身份运行"**
3. 首次运行会弹出证书安装提示，点击 **"是"** 或 **"安装"**
4. 看到类似以下输出即为成功：

```
[2026-02-06 21:30:00] WebSocket服务已启动: ws://127.0.0.1:8888
[2026-02-06 21:30:00] 系统代理已设置: 127.0.0.1:8827
```

> ⚠️ **重要**: 必须以管理员权限运行，否则无法设置系统代理

### 4.4 测试弹幕抓取

1. 保持 `WssBarrageService.exe` 运行
2. 打开浏览器（Chrome/Edge）
3. 访问任意抖音直播间: https://live.douyin.com/
4. 观察 `WssBarrageService.exe` 控制台是否有弹幕滚动

✅ 如果看到弹幕输出，说明配置成功！

---

## 🔑 第五步：配置 API 密钥

### 5.1 获取火山引擎 API 密钥

1. 访问 [火山引擎控制台](https://console.volcengine.com/ark/)

2. 登录/注册账号

3. 开通以下服务：
   - **豆包实时语音大模型** (Doubao-Realtime)
   - **Seed-TTS 2.0** 语音合成

4. 在控制台获取：
   - `APP ID`
   - `Access Token`

### 5.2 填写配置文件

打开项目配置文件：
```
C:\douyin-live-ai-assistant\config\default.json
```

使用记事本或 VS Code 编辑，修改以下内容：

```json
{
  "doubao": {
    "appId": "你从火山引擎获取的APP_ID",
    "accessToken": "你从火山引擎获取的ACCESS_TOKEN",
    ...
  },
  "seedTts": {
    "accessToken": "你从火山引擎获取的TTS_ACCESS_TOKEN",
    ...
  }
}
```

> 💡 **提示**: 通常 `seedTts.accessToken` 和 `doubao.accessToken` 可以使用相同的值

保存文件。

---

## 🚀 第六步：启动 AI 助手

### 6.1 确保 DouyinBarrageGrab 正在运行

检查任务栏是否有 `WssBarrageService.exe` 窗口

### 6.2 启动 AI 助手

在项目目录打开命令提示符：

```cmd
cd C:\douyin-live-ai-assistant
npm start
```

看到以下输出即为启动成功：

```
========================================
🎙️  旅游直播间AI助手 启动中...
========================================
[初始化] 景点讲解模块...
[景点讲解] 已加载: 故宫 (3段讲解)
[初始化] 问答引擎...
[初始化] Doubao AI服务...
[Doubao AI] ✅ WebSocket连接成功
[初始化] 语音合成模块...
[初始化] 音频播放模块...
[初始化] 弹幕监听模块...
[弹幕监听] WebSocket连接成功
========================================
✅ 系统已启动，正在运行中...
========================================

💡 提示:
  1. 确保 DouyinBarrageGrab 已启动
  2. 打开抖音直播间，发送测试弹幕
  3. 查看日志输出确认功能正常

按 Ctrl+C 停止程序
========================================
```

---

## 🧪 第七步：测试验证

### 7.1 测试弹幕连接

保持 AI 助手运行，打开浏览器访问抖音直播间，发送测试弹幕：
```
故宫门票多少钱?
```

观察 AI 助手控制台输出：

```
[弹幕] 测试用户: 故宫门票多少钱?
[问题检测] 测试用户: 故宫门票多少钱?
[问答引擎] 找到预设答案: 故宫 - 门票
[语音合成] Seed-TTS合成: 故宫门票旺季60元...
[音频播放] 开始播放: qa
```

✅ 如果看到以上输出并听到语音回答，说明系统运行正常！

### 7.2 测试 AI 智能回答

发送一个未预设的问题：
```
故宫和颐和园哪个更值得去?
```

控制台应该显示：

```
[问答引擎] 未找到预设答案，将调用AI生成
[Doubao AI] 提问: 故宫和颐和园哪个更值得去?
[Doubao AI] ✅ AI回答完成
[语音合成] Seed-TTS合成: ...
```

---

## 🎵 第八步：配置音频输出（可选）

### 方法1: 直接播放到系统音频

系统默认会直接播放音频到默认扬声器。

### 方法2: 使用虚拟音频设备（推荐用于直播）

如果需要将音频输出到 OBS 或抖音直播伴侣：

#### 8.1 安装虚拟音频设备

下载并安装 **VB-Audio Virtual Cable**:
- 官网: https://vb-audio.com/Cable/
- 下载 `VBCABLE_Driver_Pack.zip`
- 解压后运行 `VBCABLE_Setup_x64.exe`（以管理员身份）
- 安装完成后重启电脑

#### 8.2 配置 OBS 音频源

1. 打开 OBS Studio
2. 在 "音频混音器" 区域点击 "设置"
3. 添加音频输入捕获
4. 选择 "CABLE Output (VB-Audio Virtual Cable)"
5. 确认可以看到音频电平跳动

#### 8.3 配置系统默认播放设备

1. 右键点击任务栏音量图标
2. 选择 "声音设置" → "高级声音设置"
3. 将默认播放设备设置为 "CABLE Input"

---

## 📂 项目目录结构

```
C:\douyin-live-ai-assistant\
├── package.json           # 项目配置
├── config/
│   └── default.json      # ⚙️ 配置文件（需要填写API密钥）
├── src/
│   ├── index.js          # 主程序
│   ├── modules/          # 核心模块
│   └── utils/            # 工具函数
├── data/
│   └── scripts/          # 📝 景点讲解词（可添加更多）
│       └── spot-01-故宫.json
├── tests/                # 测试脚本
├── logs/                 # 运行日志（自动生成）
└── docs/                 # 文档
```

---

## 🔧 常见问题排查

### 问题1: DouyinBarrageGrab 无法启动

**症状**: 双击运行后闪退或报错

**解决方案**:
1. 确认以**管理员身份**运行
2. 检查端口 8888 和 8827 是否被占用：
   ```cmd
   netstat -ano | findstr "8888"
   netstat -ano | findstr "8827"
   ```
3. 如果被占用，结束占用进程或修改配置文件端口

---

### 问题2: 听不到语音输出

**症状**: 系统运行正常，但没有声音

**解决方案**:
1. 检查 Windows 音量设置
2. 确认音频设备正常工作
3. 查看 `logs/error.log` 是否有 `Speaker` 相关错误
4. 尝试重新安装项目依赖：
   ```cmd
   npm install speaker --force
   ```

---

### 问题3: API 调用失败

**症状**: 日志显示 `API错误: Unauthorized`

**解决方案**:
1. 检查 `config/default.json` 中的 API 密钥是否正确
2. 确认火山引擎服务已开通
3. 检查账号余额是否充足
4. 确认网络可以访问火山引擎服务器

---

### 问题4: 弹幕监听连接失败

**症状**: `WebSocket连接失败`

**解决方案**:
1. 确认 DouyinBarrageGrab 已启动
2. 检查配置文件中的 `barrage.wsUrl` 是否为 `ws://localhost:8888`
3. 检查防火墙是否阻止了连接
4. 尝试在浏览器访问一个抖音直播间，确认弹幕抓取工作正常

---

## 📝 开机自启动（可选）

### 方法1: 使用任务计划程序

1. 按 `Win + R`，输入 `taskschd.msc`，回车
2. 右侧点击 "创建基本任务"
3. 名称: `抖音直播AI助手`
4. 触发器: 选择 "当计算机启动时"
5. 操作: 选择 "启动程序"
6. 程序: `C:\Windows\System32\cmd.exe`
7. 参数: `/c cd C:\douyin-live-ai-assistant && npm start`
8. 勾选 "使用最高权限运行"
9. 完成

### 方法2: 使用批处理文件

创建 `启动助手.bat` 文件：

```batch
@echo off
cd C:\douyin-live-ai-assistant
npm start
pause
```

将此文件放到启动文件夹：
```
C:\ProgramData\Microsoft\Windows\Start Menu\Programs\StartUp\
```

---

## 🎓 下一步学习

1. **添加更多景点讲解词**:
   - 参考 `data/scripts/spot-01-故宫.json` 格式
   - 创建更多景点 JSON 文件

2. **自定义提示词**:
   - 编辑 `src/modules/doubao-ai-service.js`
   - 修改系统提示词，调整AI回答风格

3. **查看详细文档**:
   - [README.md](file:///Users/zhexianliu/douyin/README.md) - 项目说明
   - [AI_CONFIG_GUIDE.md](file:///Users/zhexianliu/douyin/docs/AI_CONFIG_GUIDE.md) - AI配置详解

---

## 📞 技术支持

如遇到问题：

1. 查看日志文件：`logs/app.log` 和 `logs/error.log`
2. 运行测试脚本诊断：
   ```cmd
   npm run test:barrage  # 测试弹幕连接
   npm run test:tts      # 测试语音合成
   npm run test:ai       # 测试AI问答
   ```
3. 查看项目文档和常见问题

---

## ✅ 安装完成检查清单

- [ ] Node.js 已安装并验证版本
- [ ] 项目依赖已安装（`npm install`）
- [ ] DouyinBarrageGrab 已下载并能正常运行
- [ ] 火山引擎 API 密钥已配置
- [ ] AI 助手能成功启动
- [ ] 弹幕监听正常工作
- [ ] 语音输出正常
- [ ] 已测试预设问答功能
- [ ] 已测试 AI 智能问答功能

🎉 **恭喜！安装完成！**

现在您可以开始使用旅游直播间 AI 助手了！
