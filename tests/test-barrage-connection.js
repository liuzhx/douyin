const WebSocket = require('ws');
const config = require('config');
const logger = require('../utils/logger');

/**
 * 测试弹幕连接
 */
async function testBarrageConnection() {
    console.log('========================================');
    console.log('测试弹幕连接');
    console.log('========================================\n');

    const wsUrl = config.get('barrage.wsUrl');
    console.log(`连接地址: ${wsUrl}\n`);

    console.log('正在连接 DouyinBarrageGrab...');

    const ws = new WebSocket(wsUrl);

    ws.on('open', () => {
        console.log('✅ WebSocket 连接成功!\n');
        console.log('等待弹幕消息...');
        console.log('请在抖音直播间发送测试弹幕\n');
    });

    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data.toString());

            if (message.MsgType === 1) {
                console.log(`[弹幕] ${message.User?.Nickname || '匿名'}: ${message.Content}`);
            }
        } catch (error) {
            console.error('消息解析失败:', error.message);
        }
    });

    ws.on('error', (error) => {
        console.error('❌ WebSocket 错误:', error.message);
        console.log('\n请确认:');
        console.log('1. DouyinBarrageGrab 已启动 (管理员权限)');
        console.log('2. WebSocket 服务地址正确 (默认 ws://localhost:8888)');
        console.log('3. 系统代理已配置');
        process.exit(1);
    });

    ws.on('close', () => {
        console.log('连接已关闭');
        process.exit(0);
    });

    // 30秒后自动退出
    setTimeout(() => {
        console.log('\n测试超时，退出');
        ws.close();
    }, 30000);
}

testBarrageConnection().catch(console.error);
