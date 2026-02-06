# Windows 音频播放替代方案

## 📋 问题背景

在Windows系统上安装`speaker`模块时，可能遇到以下错误：

```
error MSB8036: 找不到 Windows SDK 版本 10.0.22621.0
gyp ERR! build error
```

这是因为`speaker`是原生C++模块，需要编译，但系统缺少所需的Windows SDK。

## 🎯 解决方案总览

本文档提供**4种替代方案**，**无需安装Windows SDK**即可实现音频播放功能：

| 方案 | 难度 | 推荐度 | 特点 |
|------|------|--------|------|
| **方案1: play-sound** | ⭐ 简单 | ⭐⭐⭐⭐⭐ | 纯JS，自动调用系统播放器 |
| **方案2: node-wav-player** | ⭐ 简单 | ⭐⭐⭐⭐ | 专为WAV设计，纯JS |
| **方案3: PowerShell** | ⭐⭐ 中等 | ⭐⭐⭐ | Windows内置，零依赖 |
| **方案4: FFmpeg** | ⭐⭐ 中等 | ⭐⭐⭐ | 功能强大，支持所有格式 |

---

## ✅ 方案1: play-sound（推荐）

### 安装

```cmd
npm install play-sound
```

### 特点

- ✅ **纯JavaScript**，无需编译
- ✅ 自动检测并使用Windows Media Player
- ✅ 支持多种格式：WAV, MP3, AAC等
- ✅ 简单易用，API友好
- ✅ 跨平台（Windows/macOS/Linux）

### 使用示例

```javascript
const player = require('play-sound')({});

// 播放音频文件
player.play('audio.wav', (err) => {
    if (err) console.error('播放失败:', err);
    else console.log('播放完成');
});
```

### 集成到项目

项目已创建 `audio-player-windows.js`，会自动尝试使用此方案。

---

## ✅ 方案2: node-wav-player

### 安装

```cmd
npm install node-wav-player
```

### 特点

- ✅ 专为WAV文件设计
- ✅ 纯JavaScript，无原生依赖
- ✅ Promise API，易于使用
- ✅ 轻量级

### 使用示例

```javascript
const player = require('node-wav-player');

// 播放WAV文件
player.play({ path: 'audio.wav' })
    .then(() => console.log('播放完成'))
    .catch((err) => console.error('播放失败:', err));
```

---

## ✅ 方案3: PowerShell（零依赖）

### 安装

**无需安装**，Windows内置功能。

### 特点

- ✅ Windows原生支持
- ✅ 零npm依赖
- ✅ 可靠稳定

### 使用示例

```javascript
const { exec } = require('child_process');

// 使用PowerShell播放音频
const psCommand = `
    Add-Type -AssemblyName System.Speech;
    $player = New-Object System.Media.SoundPlayer('C:\\path\\to\\audio.wav');
    $player.PlaySync();
`;

exec(`powershell -Command "${psCommand}"`, (error) => {
    if (error) console.error('播放失败:', error);
    else console.log('播放完成');
});
```

### 备用：Windows Media Player命令行

```javascript
const { exec } = require('child_process');

exec('start /wait wmplayer "audio.wav"', (error) => {
    if (error) console.error('播放失败:', error);
});
```

---

## ✅ 方案4: FFmpeg / ffplay

### 安装

1. **下载FFmpeg**:
   - 访问: https://www.gyan.dev/ffmpeg/builds/
   - 下载 `ffmpeg-release-essentials.zip`

2. **解压并配置**:
   ```cmd
   # 解压到 C:\ffmpeg
   # 添加 C:\ffmpeg\bin 到系统PATH
   ```

3. **验证安装**:
   ```cmd
   ffplay -version
   ```

### 特点

- ✅ 功能极其强大
- ✅ 支持所有音频/视频格式
- ✅ 可用于转码、处理等

### 使用示例

```javascript
const { exec } = require('child_process');

// 使用ffplay播放（后台，无UI）
exec('ffplay -nodisp -autoexit audio.wav', (error) => {
    if (error) console.error('播放失败:', error);
    else console.log('播放完成');
});
```

---

## 🚀 快速开始：使用多后端播放模块

项目已创建 `audio-player-windows.js`，会**自动检测并选择可用的播放后端**。

### 1. 安装推荐依赖（可选）

```cmd
cd C:\Users\Administrator\douyin

# 安装 play-sound（推荐）
npm install play-sound

# 或安装 node-wav-player
npm install node-wav-player
```

### 2. 使用新模块

编辑 `src/index.js`，将原来的 `audio-player.js` 替换为 `audio-player-windows.js`：

```javascript
// 修改前：
// const AudioPlayer = require('./modules/audio-player');

// 修改后：
const AudioPlayer = require('./modules/audio-player-windows');
```

### 3. 启动测试

```cmd
npm start
```

**输出示例**：

```
[音频播放] ✅ 使用 play-sound 模块
[音频播放] 后端类型: play-sound
```

如果没有安装任何库，会自动降级到PowerShell：

```
[音频播放] ⚠️  使用系统命令播放（PowerShell）
[音频播放] 💡 建议安装: npm install play-sound
```

---

## 📊 方案对比

| 特性 | speaker | play-sound | wav-player | PowerShell | FFmpeg |
|------|---------|------------|------------|------------|--------|
| **需要编译** | ❌ 是 | ✅ 否 | ✅ 否 | ✅ 否 | ✅ 否 |
| **需要SDK** | ❌ 是 | ✅ 否 | ✅ 否 | ✅ 否 | ✅ 否 |
| **安装难度** | 困难 | 简单 | 简单 | 无 | 中等 |
| **格式支持** | PCM | 多格式 | WAV | WAV | 全格式 |
| **跨平台** | 是 | 是 | 是 | 否 | 是 |
| **性能** | 优秀 | 良好 | 良好 | 良好 | 优秀 |

---

## 🔧 故障排查

### 问题1: play-sound 播放无声音

**检查**：
```cmd
# 确认Windows Media Player已安装
wmplayer /?
```

**解决**：Windows 10/11通常已安装，如未安装可从Microsoft Store下载。

---

### 问题2: PowerShell执行策略错误

**错误信息**：
```
无法加载文件，因为在此系统上禁止运行脚本
```

**解决**：
```powershell
# 以管理员身份运行PowerShell
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
```

---

### 问题3: 临时文件未清理

**症状**：`temp-audio` 目录堆积大量WAV文件

**解决**：
```javascript
// 程序退出时清理
process.on('exit', () => {
    audioPlayer.cleanup();
});
```

---

## 💡 推荐配置

### 开发环境

```cmd
# 安装 play-sound（兼容性最好）
npm install play-sound
```

### 生产环境

```cmd
# 方案A: 使用 play-sound
npm install play-sound

# 方案B: 安装 Windows SDK（完整功能）
# 按照 WINDOWS_INSTALL_GUIDE.md 安装SDK
npm install speaker
```

### 测试环境

```cmd
# 无需安装，使用PowerShell备选方案
# 代码会自动降级
```

---

## 📝 常见问题

### Q: 哪个方案音质最好？

**A**: `speaker` > `play-sound` ≈ `wav-player` ≈ `PowerShell` ≈ `FFmpeg`

实际上差距很小，对于语音播放几乎无区别。

### Q: 可以同时安装多个方案吗？

**A**: 可以！`audio-player-windows.js` 会按优先级自动选择：
1. speaker (最优)
2. play-sound (推荐)
3. node-wav-player
4. PowerShell (备选)

### Q: 如何强制使用特定后端？

**A**: 修改 `audio-player-windows.js` 开头的检测逻辑，注释掉其他方案即可。

---

## ✅ 完成检查

- [ ] 已理解4种替代方案
- [ ] 已选择并安装一种方案（推荐 play-sound）
- [ ] 已测试音频播放正常
- [ ] 已验证临时文件清理

---

## 📞 技术支持

如遇到问题：

1. 查看日志：`logs/app.log`
2. 检查后端类型：查看启动时的输出
3. 测试音频播放：`npm run test:tts`

🎉 **现在你的Windows系统可以无障碍播放音频了！**
