const VoiceSynthesizerWebSocket = require('../src/modules/voice-synthesizer-websocket');
const config = require('config');
const fs = require('fs');

/**
 * 测试 Seed-TTS WebSocket 语音合成
 */
async function testSeedTTSWebSocket() {
    console.log('========================================');
    console.log('测试 Seed-TTS WebSocket 语音合成');
    console.log('========================================\n');

    // 检查配置
    const appId = config.get('seedTts.appId');
    const accessToken = config.get('seedTts.accessToken');

    if (appId === 'YOUR_APP_ID' || accessToken === 'YOUR_ACCESS_TOKEN') {
        console.error('❌ 请先配置 API 凭证');
        console.log('请在 config/default.json 中设置:');
        console.log('  - seedTts.appId (X-Api-App-Key)');
        console.log('  - seedTts.accessToken (X-Api-Access-Key)');
        console.log('\n提示: appId 通常与 doubao.appId 相同');
        process.exit(1);
    }

    const testText = '大家好!现在我要为大家介绍的是中国最著名的古建筑群之一——北京故宫。';

    console.log(`App ID: ${appId.substring(0, 8)}...`);
    console.log(`测试文本: ${testText}\n`);

    const synthesizer = new VoiceSynthesizerWebSocket();

    try {
        // 连接
        console.log('正在连接到 Seed-TTS WebSocket...\n');
        await synthesizer.connect();

        // 合成语音
        console.log('正在合成语音...\n');
        const audioData = await synthesizer.synthesize(testText, {
            encoding: 'mp3',
            sampleRate: 24000
        });

        console.log(`\n✅ 语音合成成功!`);
        console.log(`音频大小: ${audioData.length} bytes`);

        // 保存音频文件
        const outputDir = './test-output';
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const timestamp = Date.now();
        const outputPath = `${outputDir}/test-tts-ws-${timestamp}.mp3`;
        fs.writeFileSync(outputPath, audioData);

        console.log(`音频已保存: ${outputPath}`);
        console.log('\n💡 提示: 可以直接播放这个 MP3 文件\n');

        // 断开连接
        await synthesizer.disconnect();
        console.log('✅ 测试完成!');

    } catch (error) {
        console.error('\n❌ 测试失败:', error.message);
        console.error('错误详情:', error);

        if (error.message.includes('401') || error.message.includes('403')) {
            console.log('\n💡 提示: 请检查 API 凭证是否正确');
        } else if (error.message.includes('timeout')) {
            console.log('\n💡 提示: 连接超时，请检查网络连接');
        }

        process.exit(1);
    }
}

// 运行测试
testSeedTTSWebSocket().catch((error) => {
    console.error('未处理的错误:', error);
    process.exit(1);
});
