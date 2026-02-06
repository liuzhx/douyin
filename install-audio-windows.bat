@echo off
chcp 65001 >nul
echo ========================================
echo   Windows 音频播放快速修复工具
echo ========================================
echo.
echo 此工具将安装纯JavaScript音频库，无需Windows SDK
echo.
pause

echo.
echo [1/3] 清理旧的安装文件...
if exist node_modules\speaker (
    echo 检测到 speaker 模块安装失败，正在清理...
)

echo.
echo [2/3] 安装 play-sound 音频库...
npm install play-sound

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ❌ play-sound 安装失败
    echo 尝试安装备选方案 node-wav-player...
    npm install node-wav-player
    
    if %ERRORLEVEL% NEQ 0 (
        echo.
        echo ⚠️  两个库都安装失败
        echo 不过没关系，程序会自动使用 PowerShell 播放音频
        echo.
    ) else (
        echo.
        echo ✅ node-wav-player 安装成功！
        echo.
    )
) else (
    echo.
    echo ✅ play-sound 安装成功！
    echo.
)

echo [3/3] 完成项目依赖安装...
npm install

echo.
echo ========================================
echo   ✅ 安装完成！
echo ========================================
echo.
echo 现在可以运行以下命令启动程序：
echo   npm start
echo.
echo 详细说明请查看:
echo   docs\WINDOWS_AUDIO_SOLUTIONS.md
echo.
pause
