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
        const accessKey = config.get('seedTts.accessToken');
        const voiceType = options.voiceType || config.get('seedTts.voiceType');
        const encoding = options.encoding || 'pcm';  // 改为PCM格式以支持Speaker直接播放

        // 准备请求头 - 与成功案例一致
        const headers = {
            'X-Api-App-Id': appId,
            'X-Api-Access-Key': accessKey,
            'X-Api-Resource-Id': 'seed-tts-2.0',
            'Content-Type': 'application/json',
            'Connection': 'keep-alive'
        };

        // 准备请求体 - 与成功案例一致
        const payload = {
            user: {
                uid: require('crypto').randomUUID()
            },
            req_params: {
                text: text,
                speaker: voiceType,  // 使用 speaker 而不是 voice_type
                audio_params: {
                    format: encoding,
                    sample_rate: options.sampleRate || 24000,
                    enable_timestamp: true
                },
                additions: JSON.stringify({
                    disable_markdown_filter: false
                })
            }
        };

        try {
            logger.debug(`[语音合成] 请求URL: ${apiUrl}`);
            logger.debug(`[语音合成] 请求头: App-Id=${appId}, Resource-Id=seed-tts-2.0`);

            const response = await axios.post(apiUrl, payload, {
                headers: headers,
                responseType: 'stream',  // 流式响应
                timeout: 60000
            });

            logger.info('[语音合成] 开始接收流式响应');

            // 处理流式响应
            const audioChunks = [];
            let buffer = '';
            let chunkCount = 0;

            return new Promise((resolve, reject) => {
                response.data.on('data', (chunk) => {
                    chunkCount++;
                    const chunkStr = chunk.toString();
                    logger.debug(`[语音合成] 收到原始数据块 ${chunkCount}, 长度: ${chunkStr.length} 字符`);
                    logger.debug(`[语音合成] 原始数据块内容 (前200字符): ${chunkStr.substring(0, 200)}`);

                    buffer += chunkStr;

                    // 按行处理 JSON
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';

                    for (const line of lines) {
                        if (!line.trim()) continue;

                        logger.debug(`[语音合成] 处理JSON行 (前200字符): ${line.substring(0, 200)}`);

                        try {
                            const data = JSON.parse(line);
                            logger.info(`[语音合成] 解析JSON成功, code=${data.code}, 包含data字段=${!!data.data}, 包含message字段=${!!data.message}`);

                            if (data.code === 0 && data.data) {
                                // 音频数据块 (base64编码)
                                const audioBuffer = Buffer.from(data.data, 'base64');
                                audioChunks.push(audioBuffer);
                                logger.info(`[语音合成] 收到音频块 ${audioChunks.length}, 大小: ${audioBuffer.length} bytes`);
                            } else if (data.code === 20000000) {
                                // 合成完成
                                logger.info(`[语音合成] 合成完成, 共 ${audioChunks.length} 个音频块`);
                                if (data.usage) {
                                    logger.debug(`[语音合成] 使用统计: ${JSON.stringify(data.usage)}`);
                                }
                            } else if (data.code > 0) {
                                logger.error(`[语音合成] API错误: code=${data.code}, message=${data.message || '无'}`);
                                logger.error(`[语音合成] 完整错误数据: ${JSON.stringify(data)}`);
                                reject(new Error(`TTS API错误: ${data.message || data.code}`));
                            } else {
                                logger.warn(`[语音合成] 未知响应: ${JSON.stringify(data)}`);
                            }
                        } catch (parseError) {
                            logger.error(`[语音合成] JSON解析失败: ${parseError.message}`);
                            logger.error(`[语音合成] 无法解析的行: ${line}`);
                        }
                    }
                });

                response.data.on('end', () => {
                    logger.info(`[语音合成] 流结束, 总共收到 ${chunkCount} 个数据块, ${audioChunks.length} 个音频块`);
                    if (buffer.trim()) {
                        logger.warn(`[语音合成] 缓冲区剩余未处理数据: ${buffer}`);
                    }

                    if (audioChunks.length === 0) {
                        logger.error('[语音合成] 未收到音频数据');
                        reject(new Error('未收到音频数据'));
                    } else {
                        const finalAudio = Buffer.concat(audioChunks);
                        logger.info(`[语音合成] 合成成功, 音频总大小: ${finalAudio.length} bytes`);
                        resolve(finalAudio);
                    }
                });

                response.data.on('error', (error) => {
                    logger.error(`[语音合成] 流错误: ${error.message}`);
                    reject(error);
                });
            });

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
