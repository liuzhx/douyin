const DoubaoAIService = require('../src/modules/doubao-ai-service');
const config = require('config');

/**
 * 测试Doubao AI智能问答
 */
async function testDoubaoAI() {
    console.log('========================================');
    console.log('测试 Doubao AI 智能问答');
    console.log('========================================\n');

    // 检查配置
    const appId = config.get('doubao.appId');
    const accessToken = config.get('doubao.accessToken');

    if (appId === 'YOUR_APP_ID' || accessToken === 'YOUR_ACCESS_TOKEN') {
        console.error('❌ 请先配置 API 密钥');
        console.log('请在 config/default.json 中设置:');
        console.log('  - doubao.appId');
        console.log('  - doubao.accessToken');
        process.exit(1);
    }

    const aiService = new DoubaoAIService();

    try {
        // 连接
        console.log('正在连接 Doubao AI...\n');
        await aiService.connect();
        console.log('✅ 连接成功!\n');

        // 测试问题
        const testQuestions = [
            "故宫门票多少钱?",
            "故宫有什么特色?",
            "游览故宫需要多长时间?"
        ];

        for (const question of testQuestions) {
            console.log(`\n问题: ${question}`);
            console.log('AI回答中...\n');

            const response = await aiService.askQuestion(question, {
                currentSpot: {
                    name: "故宫",
                    category: "历史文化"
                }
            });

            console.log('✅ AI回答:');
            console.log(response.text);
            console.log(`\n音频: ${response.audio ? response.audio.length + ' bytes' : '无'}`);
            console.log('---');
        }

        console.log('\n✅ 所有测试通过!');

    } catch (error) {
        console.error('\n❌ 测试失败:', error.message);
        if (error.stack) {
            console.error('\n错误堆栈:', error.stack);
        }
        process.exit(1);
    } finally {
        aiService.disconnect();
        console.log('\n连接已关闭');
    }
}

testDoubaoAI();
