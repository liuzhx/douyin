const axios = require('axios');
const fs = require('fs');
const config = require('config');

/**
 * 测试Seed-TTS语音合成
 */
async function testSeedTTS() {
    console.log('========================================');
    console.log('测试 Seed-TTS 2.0 语音合成');
    console.log('========================================\n');

    const apiUrl = config.get('seedTts.apiUrl');
    const accessToken = config.get('seedTts.accessToken');
    const voiceType = config.get('seedTts.voiceType');
    const resourceId = config.get('seedTts.resourceId');

    // 检查配置
    if (accessToken === 'YOUR_TTS_ACCESS_TOKEN') {
        console.error('❌ 请先配置 API Access Token');
        console.log('请在 config/default.json 中设置 seedTts.accessToken');
        process.exit(1);
    }

    const testText = '大家好!现在我要为大家介绍的是中国最著名的古建筑群之一——北京故宫。';

    console.log(`测试文本: ${testText}\n`);
    console.log('正在合成语音...\n');

    try {
        const response = await axios.post(
            apiUrl,
            {
                text: testText,
                voice_type: voiceType,
                resource_id: resourceId,
                encoding: 'pcm',
                speed_ratio: 1.0,
                volume_ratio: 1.0,
                pitch_ratio: 1.0
            },
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                responseType: 'arraybuffer',
                timeout: 30000
            }
        );

        console.log('✅ 语音合成成功!');
        console.log(`音频大小: ${response.data.byteLength} bytes\n`);

        // 保存音频文件
        const outputDir = './test-output';
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const outputPath = `${outputDir}/test-tts-${Date.now()}.pcm`;
        fs.writeFileSync(outputPath, Buffer.from(response.data));

        console.log(`音频已保存: ${outputPath}`);
        console.log('\n注意: PCM格式需要专门的播放器');
        console.log('可以使用 ffplay 播放: ffplay -f s16le -ar 16000 -ac 1 ' + outputPath);

    } catch (error) {
        console.error('❌ 语音合成失败:', error.message);

        if (error.response) {
            console.log(`API 响应: ${error.response.status} - ${error.response.statusText}`);
            console.log('响应数据:', error.response.data);
        }

        process.exit(1);
    }
}

testSeedTTS().catch(console.error);
