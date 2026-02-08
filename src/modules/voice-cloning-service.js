const WebSocket = require('ws');
const EventEmitter = require('events');
const config = require('config');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

/**
 * 声音复刻服务 - 使用火山引擎WebSocket V1二进制协议
 * API: wss://openspeech.bytedance.com/api/v1/tts/ws_binary
 */
class VoiceCloningService extends EventEmitter {
    constructor() {
        super();

        this.wsUrl = config.get('voiceCloning.wsUrl');
        this.appId = config.get('voiceCloning.appId');
        this.token = config.get('voiceCloning.token');
        this.cluster = config.get('voiceCloning.cluster');
        this.voiceType = config.get('voiceCloning.voiceType');
        this.encoding = config.get('voiceCloning.encoding');
        this.rate = config.get('voiceCloning.rate');
        this.speedRatio = config.get('voiceCloning.speedRatio');

        this.ws = null;
        this.isConnected = false;
        this.audioChunks = [];
        this.currentReqId = null;

        logger.info('[声音复刻] 初始化服务');
        logger.info(`[声音复刻] Cluster: ${this.cluster}, Voice: ${this.voiceType}`);
    }

    /**
     * 连接WebSocket
     */
    async connect() {
        return new Promise((resolve, reject) => {
            try {
                // 设置认证header
                const headers = {
                    'Authorization': `Bearer;${this.token}`
                };

                this.ws = new WebSocket(this.wsUrl, { headers });

                this.ws.on('open', () => {
                    this.isConnected = true;
                    logger.info('[声音复刻] ✅ WebSocket连接成功');
                    resolve();
                });

                this.ws.on('message', (data) => {
                    this.handleBinaryMessage(data);
                });

                this.ws.on('error', (error) => {
                    logger.error(`[声音复刻] WebSocket错误: ${error.message}`);
                    this.isConnected = false;
                    reject(error);
                });

                this.ws.on('close', () => {
                    logger.warn('[声音复刻] WebSocket连接关闭');
                    this.isConnected = false;
                });

            } catch (error) {
                logger.error(`[声音复刻] 连接失败: ${error.message}`);
                reject(error);
            }
        });
    }

    /**
     * 处理二进制消息
     */
    handleBinaryMessage(data) {
        try {
            // 解析二进制header (4 bytes)
            const header = data.readUInt32BE(0);

            // 提取字段
            const protocolVersion = (header >> 28) & 0xF;
            const headerSize = (header >> 24) & 0xF;
            const messageType = (header >> 20) & 0xF;
            const messageTypeFlags = (header >> 16) & 0xF;
            const serializationMethod = (header >> 12) & 0xF;
            const compressionMethod = (header >> 8) & 0xF;

            logger.debug(`[声音复刻] 收到消息 - Type: ${messageType}, Flags: ${messageTypeFlags}`);

            // 0b1011 = Audio-only server response
            if (messageType === 0b1011) {
                // 音频数据从第4字节开始
                const audioData = data.slice(4);

                this.audioChunks.push(audioData);

                // messageTypeFlags == 0b0010 or 0b0011 表示最后一个片段
                if (messageTypeFlags >= 0b0010) {
                    logger.info('[声音复刻] ✅ 接收完成');
                    this.emitAudioComplete();
                }

            } else if (messageType === 0b1111) {
                // 错误消息
                const errorMsg = data.slice(4).toString('utf-8');
                logger.error(`[声音复刻] 服务器错误: ${errorMsg}`);
                this.emit('error', new Error(errorMsg));
            } else {
                // 可能是JSON响应
                const payload = data.slice(4).toString('utf-8');
                try {
                    const response = JSON.parse(payload);
                    logger.debug(`[声音复刻] JSON响应: ${JSON.stringify(response)}`);

                    if (response.code !== 3000) {
                        logger.error(`[声音复刻] 合成失败: ${response.message} (${response.code})`);
                        this.emit('error', new Error(response.message));
                    }
                } catch (e) {
                    logger.warn('[声音复刻] 无法解析响应为JSON');
                }
            }

        } catch (error) {
            logger.error(`[声音复刻] 处理消息失败: ${error.message}`);
        }
    }

    /**
     * 合成语音
     * @param {string} text - 要合成的文本
     * @returns {Promise<Buffer>} - 音频数据
     */
    async synthesize(text) {
        return new Promise((resolve, reject) => {
            if (!this.isConnected) {
                return reject(new Error('WebSocket未连接'));
            }

            // 限制文本长度
            if (Buffer.byteLength(text, 'utf-8') > 1024) {
                logger.warn('[声音复刻] 文本过长，截断到1024字节');
                text = text.substring(0, 300); // 约1024字节UTF-8
            }

            // 清空之前的音频缓存
            this.audioChunks = [];
            this.currentReqId = uuidv4();

            // 构建请求payload
            const payload = {
                app: {
                    appid: this.appId,
                    token: this.token,
                    cluster: this.cluster
                },
                user: {
                    uid: 'douyin_assistant'
                },
                audio: {
                    voice_type: this.voiceType,
                    encoding: this.encoding,
                    rate: this.rate,
                    speed_ratio: this.speedRatio
                },
                request: {
                    reqid: this.currentReqId,
                    text: text,
                    text_type: 'plain',
                    operation: 'submit'  // submit = 流式
                }
            };

            logger.info(`[声音复刻] 开始合成: ${text.substring(0, 50)}...`);
            logger.debug(`[声音复刻] 请求ID: ${this.currentReqId}`);

            // 监听完成事件
            const onComplete = (audioBuffer) => {
                resolve(audioBuffer);
                this.removeListener('error', onError);
            };

            const onError = (error) => {
                reject(error);
                this.removeListener('audio-complete', onComplete);
            };

            this.once('audio-complete', onComplete);
            this.once('error', onError);

            // 发送二进制请求
            try {
                this.sendBinaryRequest(payload);
            } catch (error) {
                this.removeListener('audio-complete', onComplete);
                this.removeListener('error', onError);
                reject(error);
            }
        });
    }

    /**
     * 发送二进制格式请求
     */
    sendBinaryRequest(payload) {
        // 将payload转为JSON字符串
        const payloadJson = JSON.stringify(payload);
        const payloadBuffer = Buffer.from(payloadJson, 'utf-8');

        // 构建4字节header
        const protocolVersion = 0b0001;
        const headerSize = 0b0001;  // 4 bytes
        const messageType = 0b0001;  // full client request
        const messageTypeFlags = 0b0000;
        const serializationMethod = 0b0001;  // JSON
        const compressionMethod = 0b0000;  // 无压缩
        const reserved = 0x00;

        const header = (
            (protocolVersion << 28) |
            (headerSize << 24) |
            (messageType << 20) |
            (messageTypeFlags << 16) |
            (serializationMethod << 12) |
            (compressionMethod << 8) |
            reserved
        );

        const headerBuffer = Buffer.allocUnsafe(4);
        headerBuffer.writeUInt32BE(header, 0);

        // 合并header和payload
        const message = Buffer.concat([headerBuffer, payloadBuffer]);

        logger.debug(`[声音复刻] 发送请求，大小: ${message.length} bytes`);
        this.ws.send(message);
    }

    /**
     * 音频接收完成
     */
    emitAudioComplete() {
        // 合并所有音频片段
        const audioBuffer = Buffer.concat(this.audioChunks);

        logger.info(`[声音复刻] ✅ 合成完成，音频大小: ${audioBuffer.length} bytes`);

        this.emit('audio-complete', audioBuffer);
        this.audioChunks = [];
    }

    /**
     * 关闭连接
     */
    close() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
            this.isConnected = false;
            logger.info('[声音复刻] 连接已关闭');
        }
    }
}

module.exports = VoiceCloningService;
