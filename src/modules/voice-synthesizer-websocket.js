const WebSocket = require('ws');
const EventEmitter = require('events');
const config = require('config');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

/**
 * 火山引擎 Seed-TTS WebSocket 语音合成模块
 * 使用 bidirection WebSocket API
 */
class VoiceSynthesizerWebSocket extends EventEmitter {
    constructor() {
        super();
        this.ws = null;
        this.isConnected = false;
        this.messageQueue = [];
        this.pendingMessages = new Map();
        this.currentSession = null;
    }

    /**
     * 初始化 WebSocket 连接
     */
    async connect() {
        const endpoint = config.get('seedTts.wsUrl') || 'wss://openspeech.bytedance.com/api/v3/tts/bidirection';
        const appId = config.get('seedTts.appId') || config.get('doubao.appId');
        const accessToken = config.get('seedTts.accessToken');
        const resourceId = this.getResourceId(config.get('seedTts.voiceType'));

        const headers = {
            'X-Api-App-Key': appId,
            'X-Api-Access-Key': accessToken,
            'X-Api-Resource-Id': resourceId,
            'X-Api-Connect-Id': uuidv4()
        };

        logger.info('[TTS-WS] 正在连接到 Seed-TTS WebSocket...');
        logger.debug(`[TTS-WS] 端点: ${endpoint}`);

        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(endpoint, {
                    headers,
                    skipUTF8Validation: true
                });

                this.ws.on('open', async () => {
                    logger.info('[TTS-WS] WebSocket 连接成功');
                    try {
                        await this.startConnection();
                        this.isConnected = true;
                        this.setupMessageHandler();
                        resolve();
                    } catch (error) {
                        reject(error);
                    }
                });

                this.ws.on('error', (error) => {
                    logger.error(`[TTS-WS] WebSocket 错误: ${error.message}`);
                    this.isConnected = false;
                    reject(error);
                });

                this.ws.on('close', () => {
                    logger.warn('[TTS-WS] WebSocket 连接已关闭');
                    this.isConnected = false;
                });

            } catch (error) {
                logger.error(`[TTS-WS] 连接失败: ${error.message}`);
                reject(error);
            }
        });
    }

    /**
     * 根据语音类型获取 Resource ID
     */
    getResourceId(voiceType) {
        // 如果配置中指定了 resourceId，使用配置的
        const configResourceId = config.get('seedTts.resourceId');
        if (configResourceId && configResourceId !== 'seed-tts-2.0') {
            return configResourceId;
        }

        // 根据 voice_type 自动判断
        if (voiceType && voiceType.startsWith('S_')) {
            return 'volc.megatts.default';
        }
        return 'volc.service_type.10029';
    }

    /**
     * 设置消息处理器
     */
    setupMessageHandler() {
        this.ws.on('message', (data) => {
            try {
                const msg = this.unmarshalMessage(data);
                logger.debug(`[TTS-WS] 收到消息: ${this.messageToString(msg)}`);

                // 处理消息
                this.handleMessage(msg);
            } catch (error) {
                logger.error(`[TTS-WS] 消息处理失败: ${error.message}`);
            }
        });
    }

    /**
     * 处理收到的消息
     */
    handleMessage(msg) {
        // 如果有等待的 Promise，解决它
        if (this.currentSession && this.currentSession.pending) {
            const { event, resolve, reject, audioChunks } = this.currentSession.pending;

            // 收集音频数据
            if (msg.type === 0b1011) { // AudioOnlyServer
                audioChunks.push(msg.payload);
            }

            // 检查事件
            if (msg.event === event) {
                if (msg.type === 0b1111) { // Error
                    reject(new Error(`TTS错误: ${new TextDecoder().decode(msg.payload)}`));
                } else {
                    resolve(msg);
                }
                this.currentSession.pending = null;
            }

            // 会话结束，收集所有音频
            if (msg.event === 152) { // SessionFinished
                if (this.currentSession.onAudioComplete) {
                    const audioBuffer = Buffer.concat(audioChunks);
                    this.currentSession.onAudioComplete(audioBuffer);
                }
            }
        }

        this.emit('message', msg);
    }

    /**
     * 发送消息并等待响应
     */
    async sendAndWait(msg, expectedEvent) {
        return new Promise((resolve, reject) => {
            const data = this.marshalMessage(msg);

            this.ws.send(data, (error) => {
                if (error) {
                    reject(error);
                    return;
                }

                // 设置等待的事件
                if (!this.currentSession) {
                    this.currentSession = {};
                }

                this.currentSession.pending = {
                    event: expectedEvent,
                    resolve,
                    reject,
                    audioChunks: []
                };

                // 超时保护
                setTimeout(() => {
                    if (this.currentSession && this.currentSession.pending) {
                        this.currentSession.pending.reject(new Error('等待响应超时'));
                        this.currentSession.pending = null;
                    }
                }, 30000);
            });
        });
    }

    /**
     * 启动连接
     */
    async startConnection() {
        logger.info('[TTS-WS] 发送 StartConnection...');

        const msg = {
            version: 1,
            headerSize: 1,
            type: 0b0001, // FullClientRequest
            flag: 0b100,  // WithEvent
            serialization: 0b1, // JSON
            compression: 0,
            event: 1, // StartConnection
            payload: Buffer.from('{}')
        };

        await this.sendAndWait(msg, 50); // ConnectionStarted
        logger.info('[TTS-WS] 连接已启动');
    }

    /**
     * 使用 Seed-TTS 合成语音
     * @param {string} text - 要合成的文本
     * @param {Object} options - 选项
     * @returns {Promise<Buffer>} - 音频数据
     */
    async synthesize(text, options = {}) {
        if (!this.isConnected) {
            logger.warn('[TTS-WS] 未连接，正在重新连接...');
            await this.connect();
        }

        logger.info(`[TTS-WS] 合成语音: ${text.substring(0, 30)}...`);

        const sessionId = uuidv4();
        const voiceType = options.voiceType || config.get('seedTts.voiceType');
        const encoding = options.encoding || 'mp3';

        try {
            // 1. 启动会话
            const requestConfig = {
                user: {
                    uid: uuidv4()
                },
                req_params: {
                    speaker: voiceType,
                    audio_params: {
                        format: encoding,
                        sample_rate: options.sampleRate || 24000,
                        enable_timestamp: true
                    },
                    additions: JSON.stringify({
                        disable_markdown_filter: false
                    })
                },
                event: 100 // StartSession
            };

            const startMsg = {
                version: 1,
                headerSize: 1,
                type: 0b0001, // FullClientRequest
                flag: 0b100,  // WithEvent
                serialization: 0b1, // JSON
                compression: 0,
                event: 100, // StartSession
                sessionId: sessionId,
                payload: Buffer.from(JSON.stringify(requestConfig))
            };

            await this.sendAndWait(startMsg, 150); // SessionStarted
            logger.info('[TTS-WS] 会话已启动');

            // 2. 发送文本请求
            const audioChunks = [];
            this.currentSession.onAudioComplete = (audioBuffer) => {
                audioChunks.push(audioBuffer);
            };

            // 逐字发送（按照官方 demo 的做法）
            for (const char of text) {
                const taskConfig = {
                    ...requestConfig,
                    req_params: {
                        ...requestConfig.req_params,
                        text: char
                    },
                    event: 200 // TaskRequest
                };

                const taskMsg = {
                    version: 1,
                    headerSize: 1,
                    type: 0b0001,
                    flag: 0b100,
                    serialization: 0b1,
                    compression: 0,
                    event: 200, // TaskRequest
                    sessionId: sessionId,
                    payload: Buffer.from(JSON.stringify(taskConfig))
                };

                this.ws.send(this.marshalMessage(taskMsg));
            }

            // 3. 结束会话
            const finishMsg = {
                version: 1,
                headerSize: 1,
                type: 0b0001,
                flag: 0b100,
                serialization: 0b1,
                compression: 0,
                event: 102, // FinishSession
                sessionId: sessionId,
                payload: Buffer.from('{}')
            };

            await this.sendAndWait(finishMsg, 152); // SessionFinished
            logger.info('[TTS-WS] 会话已结束');

            // 返回合并的音频数据
            const finalAudio = Buffer.concat(audioChunks);
            logger.info(`[TTS-WS] 合成成功，音频大小: ${finalAudio.length} bytes`);

            return finalAudio;

        } catch (error) {
            logger.error(`[TTS-WS] 合成失败: ${error.message}`);
            throw error;
        }
    }

    /**
     * 序列化消息（简化版）
     */
    marshalMessage(msg) {
        const buffers = [];

        // Header (4 bytes minimum)
        const headerSize = 4 * (msg.headerSize || 1);
        const header = Buffer.alloc(headerSize);

        header[0] = (msg.version << 4) | msg.headerSize;
        header[1] = (msg.type << 4) | msg.flag;
        header[2] = (msg.serialization << 4) | msg.compression;

        buffers.push(header);

        // Event (如果有 WithEvent flag)
        if (msg.flag & 0b100) {
            const eventBuf = Buffer.alloc(4);
            eventBuf.writeInt32BE(msg.event, 0);
            buffers.push(eventBuf);

            // Session ID (除了连接事件)
            if (msg.event !== 1 && msg.event !== 2 && msg.sessionId) {
                const sessionIdBuf = Buffer.from(msg.sessionId, 'utf8');
                const sizeBuf = Buffer.alloc(4);
                sizeBuf.writeUInt32BE(sessionIdBuf.length, 0);
                buffers.push(sizeBuf);
                buffers.push(sessionIdBuf);
            }
        }

        // Payload
        const payloadSize = Buffer.alloc(4);
        payloadSize.writeUInt32BE(msg.payload.length, 0);
        buffers.push(payloadSize);
        buffers.push(msg.payload);

        return Buffer.concat(buffers);
    }

    /**
     * 反序列化消息（简化版）
     */
    unmarshalMessage(data) {
        let offset = 0;

        // Read header
        const versionAndHeaderSize = data[offset++];
        const typeAndFlag = data[offset++];
        const serializationAndCompression = data[offset++];

        const msg = {
            version: versionAndHeaderSize >> 4,
            headerSize: versionAndHeaderSize & 0x0F,
            type: typeAndFlag >> 4,
            flag: typeAndFlag & 0x0F,
            serialization: serializationAndCompression >> 4,
            compression: serializationAndCompression & 0x0F
        };

        // Skip to end of header
        offset = 4 * msg.headerSize;

        // Read event if WithEvent flag is set
        if (msg.flag & 0b100) {
            msg.event = data.readInt32BE(offset);
            offset += 4;

            // Read session ID if present
            if (msg.event !== 1 && msg.event !== 2 && msg.event !== 50 && msg.event !== 51 && msg.event !== 52) {
                const sessionIdSize = data.readUInt32BE(offset);
                offset += 4;
                if (sessionIdSize > 0) {
                    msg.sessionId = data.toString('utf8', offset, offset + sessionIdSize);
                    offset += sessionIdSize;
                }
            }
        }

        // Read payload
        const payloadSize = data.readUInt32BE(offset);
        offset += 4;
        msg.payload = data.slice(offset, offset + payloadSize);

        return msg;
    }

    /**
     * 消息转字符串
     */
    messageToString(msg) {
        const eventNames = {
            1: 'StartConnection', 2: 'FinishConnection',
            50: 'ConnectionStarted', 52: 'ConnectionFinished',
            100: 'StartSession', 102: 'FinishSession',
            150: 'SessionStarted', 152: 'SessionFinished',
            200: 'TaskRequest'
        };

        const typeNames = {
            0b0001: 'FullClientRequest',
            0b1001: 'FullServerResponse',
            0b1011: 'AudioOnlyServer'
        };

        const eventStr = eventNames[msg.event] || `Event${msg.event}`;
        const typeStr = typeNames[msg.type] || `Type${msg.type}`;

        if (msg.type === 0b1011) {
            return `${typeStr}, ${eventStr}, PayloadSize: ${msg.payload.length}`;
        }

        const payloadStr = msg.payload.length > 0 ?
            new TextDecoder().decode(msg.payload).substring(0, 100) : '';

        return `${typeStr}, ${eventStr}, Payload: ${payloadStr}`;
    }

    /**
     * 断开连接
     */
    async disconnect() {
        if (this.ws && this.isConnected) {
            logger.info('[TTS-WS] 断开连接...');

            const msg = {
                version: 1,
                headerSize: 1,
                type: 0b0001,
                flag: 0b100,
                serialization: 0b1,
                compression: 0,
                event: 2, // FinishConnection
                payload: Buffer.from('{}')
            };

            try {
                await this.sendAndWait(msg, 52); // ConnectionFinished
                this.ws.close();
            } catch (error) {
                logger.error(`[TTS-WS] 断开连接失败: ${error.message}`);
                this.ws.close();
            }

            this.isConnected = false;
        }
    }
}

module.exports = VoiceSynthesizerWebSocket;
