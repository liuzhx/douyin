const WebSocket = require('ws');
const config = require('config');

/**
 * 测试Doubao-Realtime连接
 */
async function testDoubaoRealtime() {
    console.log('========================================');
    console.log('测试 Doubao-Realtime 实时语音对话');
    console.log('========================================\n');

    const wsUrl = config.get('doubao.realtimeUrl');
    const appId = config.get('doubao.appId');
    const accessToken = config.get('doubao.accessToken');
    const resourceId = config.get('doubao.resourceId');
    const appKey = config.get('doubao.appKey');

    // 检查配置
    if (appId === 'YOUR_APP_ID' || accessToken === 'YOUR_ACCESS_TOKEN') {
        console.error('❌ 请先配置 API 密钥');
        console.log('请在 config/default.json 中设置:');
        console.log('  - doubao.appId');
        console.log('  - doubao.accessToken');
        process.exit(1);
    }

    console.log('正在连接 Doubao-Realtime...\n');

    const headers = {
        'X-Api-App-ID': appId,
        'X-Api-Access-Key': accessToken,
        'X-Api-Resource-Id': resourceId,
        'X-Api-App-Key': appKey
    };

    try {
        const ws = new WebSocket(wsUrl, { headers });

        ws.on('open', () => {
            console.log('✅ WebSocket 连接成功!\n');

            // 发送测试消息
            const testText = '你好，请简单介绍一下北京故宫';
            console.log(`发送测试问题: ${testText}\n`);

            ws.send(JSON.stringify({
                type: 'input_text',
                text: testText
            }));
        });

        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                console.log('收到服务器消息:', message);
            } catch (error) {
                console.log('收到数据:', data.toString().substring(0, 100));
            }
        });

        ws.on('error', (error) => {
            console.error('❌ WebSocket 错误:', error.message);
            process.exit(1);
        });

        ws.on('close', () => {
            console.log('\n连接已关闭');
            process.exit(0);
        });

        // 30秒后自动退出
        setTimeout(() => {
            console.log('\n测试超时，退出');
            ws.close();
        }, 30000);

    } catch (error) {
        console.error('❌ 连接失败:', error.message);
        process.exit(1);
    }
}

testDoubaoRealtime().catch(console.error);
