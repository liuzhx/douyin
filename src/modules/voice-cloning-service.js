const WebSocket = require('ws');
const EventEmitter = require('events');
const config = require('config');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');
const zlib = require('zlib');

/**
 * 声音复刻服务 - 使用火山引擎WebSocket V1二进制协议
 * 完全按照Python官方demo实现
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
                // 设置认证header - 注意分号和空格
                const headers = {
                    'Authorization': `Bearer; ${this.token}`
                };

                this.ws = new WebSocket(this.wsUrl, {
                    headers,
                    perMessageDeflate: false  // 禁用自动压缩
                });

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
     * 处理二进制消息（按照Python demo格式）
     */
    handleBinaryMessage(data) {
        try {
            // 解析header（Python demo方式）
            const protocolVersion = data[0] >> 4;
            const headerSize = data[0] & 0x0f;
            const messageType = data[1] >> 4;
            const messageTypeFlags = data[1] & 0x0f;
            const serializationMethod = data[2] >> 4;
            const compressionMethod = data[2] & 0x0f;

            const headerBytes = headerSize * 4;
            let payload = data.slice(headerBytes);

            logger.debug(`[声音复刻] 收到消息 - Type: 0x${messageType.toString(16)}, Flags: ${messageTypeFlags}`);

            // 0xb = 11 = Audio-only server response
            if (messageType === 0xb) {
                if (messageTypeFlags === 0) {
                    // No sequence number (ACK)
                    logger.debug('[声音复刻] 收到ACK');
                    return;
                }

                // 提取sequence number (4 bytes, signed) 和 payload size (4 bytes, unsigned)
                const sequenceNumber = payload.readInt32BE(0);
                const payloadSize = payload.readUInt32BE(4);
                const audioData = payload.slice(8);  // 跳过seq(4) + size(4) = 8字节

                logger.debug(`[声音复刻] - Sequence: ${sequenceNumber}, Size: ${payloadSize} bytes`);

                // 保存音频数据
                this.audioChunks.push(audioData);

                // sequence < 0 表示最后一个片段
                if (sequenceNumber < 0) {
                    logger.info('[声音复刻] ✅ 接收完成');
                    this.emitAudioComplete();
                }

            } else if (messageType === 0xf) {
                // 错误消息
                const code = payload.readUInt32BE(0);
                const msgSize = payload.readUInt32BE(4);
                let errorMsg = payload.slice(8);

                // 如果有gzip压缩
                if (compressionMethod === 1) {
                    errorMsg = zlib.gunzipSync(errorMsg);
                }

                const errorText = errorMsg.toString('utf-8');
                logger.error(`[声音复刻] 服务器错误 ${code}: ${errorText}`);
                this.emit('error', new Error(errorText));

            } else if (messageType === 0xc) {
                // Frontend message
                const msgSize = payload.readUInt32BE(0);
                payload = payload.slice(4);

                if (compressionMethod === 1) {
                    payload = zlib.gunzipSync(payload);
                }

                logger.debug(`[声音复刻] Frontend消息: ${payload.toString('utf-8')}`);
            } else {
                logger.warn(`[声音复刻] 未知消息类型: 0x${messageType.toString(16)}`);
            }

        } catch (error) {
            logger.error(`[声音复刻] 处理消息失败: ${error.message}`);
            logger.error(error.stack);
        }
    }

    /**
     * 合成语音
     */
    async synthesize(text) {
        return new Promise((resolve, reject) => {
            if (!this.isConnected) {
                return reject(new Error('WebSocket未连接'));
            }

            // 限制文本长度
            if (Buffer.byteLength(text, 'utf-8') > 1024) {
                logger.warn('[声音复刻] 文本过长，截断到1024字节');
                text = text.substring(0, 300);
            }

            // 清空之前的音频缓存
            this.audioChunks = [];
            this.currentReqId = uuidv4();

            // 构建请求payload
            const payload = {
                app: {
                    appid: this.appId,
                    token: "access_token",  // Python demo中的固定值
                    cluster: this.cluster
                },
                user: {
                    uid: "douyin_assistant"
                },
                audio: {
                    voice_type: this.voiceType,
                    encoding: this.encoding,
                    speed_ratio: this.speedRatio,
                    volume_ratio: 1.0,
                    pitch_ratio: 1.0
                },
                request: {
                    reqid: this.currentReqId,
                    text: text,
                    text_type: 'plain',
                    operation: 'submit'  // submit = 流式
                }
            };

            logger.info(`[声音复刻] 开始合成: ${text.substring(0, 50)}...`);

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
     * 发送二进制格式请求（完全按照Python demo）
     */
    sendBinaryRequest(payload) {
        // 1. JSON序列化并gzip压缩
        const payloadJson = JSON.stringify(payload);
        const payloadBuffer = Buffer.from(payloadJson, 'utf-8');
        const compressedPayload = zlib.gzipSync(payloadBuffer);

        // 2. 构建header（4字节）
        // Python demo: default_header = bytearray(b'\x11\x10\x11\x00')
        // 0x11 = 0001 0001 = protocol(0001) + header_size(0001)
        // 0x10 = 0001 0000 = message_type(0001) + flags(0000)
        // 0x11 = 0001 0001 = serialization(0001, JSON) + compression(0001, gzip)
        // 0x00 = reserved
        const header = Buffer.from([0x11, 0x10, 0x11, 0x00]);

        // 3. Payload size（4字节，big-endian）
        const payloadSize = Buffer.allocUnsafe(4);
        payloadSize.writeUInt32BE(compressedPayload.length, 0);

        // 4. 组装：header(4) + payload_size(4) + compressed_payload
        const message = Buffer.concat([header, payloadSize, compressedPayload]);

        logger.debug(`[声音复刻] 发送请求`);
        logger.debug(`[声音复刻] - 原始payload: ${payloadBuffer.length} bytes`);
        logger.debug(`[声音复刻] - 压缩后: ${compressedPayload.length} bytes`);
        logger.debug(`[声音复刻] - 总大小: ${message.length} bytes`);

        // 5. 发送
        this.ws.send(message);
    }

    /**
     * 音频接收完成
     */
    emitAudioComplete() {
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
