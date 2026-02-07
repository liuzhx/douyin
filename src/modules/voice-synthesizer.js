const WebSocket = require('ws');
const axios = require('axios');
const EventEmitter = require('events');
const config = require('config');
const logger = require('../utils/logger');

/**
 * 语音合成模块
 * 双引擎策略:
 * 1. Seed-TTS 2.0 - 用于景点讲解(高质量)
 * 2. Doubao-Realtime - 用于实时问答(低延迟)
 */
class VoiceSynthesizer extends EventEmitter {
    constructor() {
        super();
        this.doubaoWs = null;
        this.isDoubaoConnected = false;
    }

    /**
     * 初始化Doubao-Realtime连接
     */
    async initializeDoubaoRealtime() {
        const wsUrl = config.get('doubao.realtimeUrl');
        const headers = {
            'X-Api-App-ID': config.get('doubao.appId'),
            'X-Api-Access-Key': config.get('doubao.accessToken'),
            'X-Api-Resource-Id': config.get('doubao.resourceId'),
            'X-Api-App-Key': config.get('doubao.appKey')
        };

        logger.info('[语音合成] 正在连接 Doubao-Realtime...');

        try {
            this.doubaoWs = new WebSocket(wsUrl, { headers });

            this.doubaoWs.on('open', () => {
                logger.info('[语音合成] Doubao-Realtime 连接成功');
                this.isDoubaoConnected = true;
                this.emit('doubao-connected');
            });

            this.doubaoWs.on('message', (data) => {
                this.handleDoubaoMessage(data);
            });

            this.doubaoWs.on('error', (error) => {
                logger.error(`[语音合成] Doubao-Realtime 错误: ${error.message}`);
                this.isDoubaoConnected = false;
            });

            this.doubaoWs.on('close', () => {
                logger.warn('[语音合成] Doubao-Realtime 连接已关闭');
                this.isDoubaoConnected = false;
            });

        } catch (error) {
            logger.error(`[语音合成] Doubao-Realtime 连接失败: ${error.message}`);
            throw error;
        }
    }

    /**
     * 处理Doubao-Realtime消息
     * @param {Buffer} data - 消息数据
     */
    handleDoubaoMessage(data) {
        try {
            const message = JSON.parse(data.toString());
            logger.debug(`[语音合成] Doubao消息: ${message.type || message.event}`);

            // 根据消息类型处理
            if (message.type === 'audio') {
                this.emit('doubao-audio', message.data);
            } else if (message.type === 'text') {
                this.emit('doubao-text', message.text);
            }

        } catch (error) {
            logger.error(`[语音合成] Doubao消息解析失败: ${error.message}`);
        }
    }

    /**
     * 使用Seed-TTS 2.0合成语音(用于景点讲解)
     * @param {string} text - 要合成的文本
     * @param {Object} options - 可选参数
     * @returns {Promise<Buffer>} - 音频数据
     */
    async synthesizeWithSeedTTS(text, options = {}) {
        logger.info(`[语音合成] Seed-TTS合成: ${text.substring(0, 30)}...`);

        const apiUrl = config.get('seedTts.apiUrl');
        const appId = config.get('seedTts.appId');
        const accessToken = config.get('seedTts.accessToken');
        const voiceType = options.voiceType || config.get('seedTts.voiceType');

        // V3 API请求格式
        const requestBody = {
            app: {
                appid: appId,
                token: accessToken,
                cluster: "volcano_tts"
            },
            user: {
                uid: "anonymous"
            },
            audio: {
                voice_type: voiceType,
                encoding: options.encoding || "mp3",
                speed_ratio: options.speedRatio || 1.0,
                volume_ratio: options.volumeRatio || 1.0,
                pitch_ratio: options.pitchRatio || 1.0
            },
            request: {
                reqid: require('crypto').randomUUID(),
                text: text,
                text_type: "plain",
                operation: "query",
                with_frontend: 1,
                frontend_type: "unitTson"
            }
        };

        try {
            const response = await axios.post(
                apiUrl,
                requestBody,
                {
                    headers: {
                        'Authorization': `Bearer;${accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000
                }
            );

            logger.info('[语音合成] Seed-TTS合成成功');

            // V3 API返回JSON格式，音频数据是base64编码的
            if (response.data && response.data.data) {
                const audioBase64 = response.data.data;
                return Buffer.from(audioBase64, 'base64');
            } else {
                throw new Error('响应格式不正确：缺少音频数据');
            }

        } catch (error) {
            logger.error(`[语音合成] Seed-TTS合成失败: ${error.message}`);

            if (error.response) {
                logger.error(`[语音合成] API响应: ${error.response.status} - ${error.response.statusText}`);
                if (error.response.data) {
                    logger.error(`[语音合成] 响应内容: ${JSON.stringify(error.response.data)}`);
                }
            }

            throw error;
        }
    }

    /**
     * 使用Doubao-Realtime合成语音(用于实时问答)
     * @param {string} text - 要合成的文本
     * @returns {Promise<Buffer>} - 音频数据
     */
    async synthesizeWithDoubaoRealtime(text) {
        logger.info(`[语音合成] Doubao-Realtime合成: ${text.substring(0, 30)}...`);

        if (!this.isDoubaoConnected) {
            logger.warn('[语音合成] Doubao-Realtime未连接，尝试重新连接...');
            await this.initializeDoubaoRealtime();
        }

        return new Promise((resolve, reject) => {
            const audioChunks = [];
            const timeout = setTimeout(() => {
                reject(new Error('Doubao-Realtime 合成超时'));
            }, 30000);

            const audioHandler = (chunk) => {
                audioChunks.push(chunk);
            };

            const completeHandler = () => {
                clearTimeout(timeout);
                this.off('doubao-audio', audioHandler);
                this.off('doubao-complete', completeHandler);

                const audioBuffer = Buffer.concat(audioChunks);
                logger.info('[语音合成] Doubao-Realtime合成完成');
                resolve(audioBuffer);
            };

            this.on('doubao-audio', audioHandler);
            this.on('doubao-complete', completeHandler);

            // 发送纯文本输入请求
            try {
                this.doubaoWs.send(JSON.stringify({
                    type: 'input_text',
                    text: text
                }));
            } catch (error) {
                clearTimeout(timeout);
                this.off('doubao-audio', audioHandler);
                this.off('doubao-complete', completeHandler);
                reject(error);
            }
        });
    }

    /**
     * 智能选择合成引擎
     * @param {string} text - 要合成的文本
     * @param {string} type - 类型: 'narration'(讲解) 或 'qa'(问答)
     * @returns {Promise<Buffer>} - 音频数据
     */
    async synthesize(text, type = 'narration') {
        if (type === 'narration') {
            // 景点讲解使用Seed-TTS(高质量)
            return await this.synthesizeWithSeedTTS(text);
        } else {
            // 实时问答使用Doubao-Realtime(低延迟)
            // 注意: Doubao-Realtime可能需要特殊配置,这里作为示例
            // 如果Doubao-Realtime不可用,降级到Seed-TTS
            try {
                return await this.synthesizeWithDoubaoRealtime(text);
            } catch (error) {
                logger.warn('[语音合成] Doubao-Realtime失败，降级到Seed-TTS');
                return await this.synthesizeWithSeedTTS(text);
            }
        }
    }

    /**
     * 断开连接
     */
    disconnect() {
        if (this.doubaoWs) {
            logger.info('[语音合成] 断开Doubao-Realtime连接');
            this.doubaoWs.close();
            this.doubaoWs = null;
            this.isDoubaoConnected = false;
        }
    }
}

module.exports = VoiceSynthesizer;
