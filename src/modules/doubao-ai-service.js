const WebSocket = require('ws');
const EventEmitter = require('events');
const config = require('config');
const logger = require('../utils/logger');

/**
 * Doubao AI服务
 * 封装与豆包实时语音大模型的交互
 * 支持纯文本输入，获取AI生成的文本和语音回答
 */
class DoubaoAIService extends EventEmitter {
    constructor() {
        super();
        this.ws = null;
        this.isConnected = false;
        this.sessionId = null;
        this.pendingRequests = new Map(); // 存储待处理的请求
    }

    /**
     * 连接Doubao-Realtime WebSocket
     */
    async connect() {
        const wsUrl = config.get('doubao.realtimeUrl');
        const headers = {
            'X-Api-App-ID': config.get('doubao.appId'),
            'X-Api-Access-Key': config.get('doubao.accessToken'),
            'X-Api-Resource-Id': config.get('doubao.resourceId'),
            'X-Api-App-Key': config.get('doubao.appKey')
        };

        logger.info('[Doubao AI] 正在连接实时语音大模型...');

        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(wsUrl, { headers });

                this.ws.on('open', () => {
                    logger.info('[Doubao AI] ✅ WebSocket连接成功');
                    this.isConnected = true;
                    this.emit('connected');
                    resolve();
                });

                this.ws.on('message', (data) => {
                    this.handleMessage(data);
                });

                this.ws.on('error', (error) => {
                    logger.error(`[Doubao AI] WebSocket错误: ${error.message}`);
                    this.isConnected = false;
                    this.emit('error', error);
                    reject(error);
                });

                this.ws.on('close', () => {
                    logger.warn('[Doubao AI] WebSocket连接已关闭');
                    this.isConnected = false;
                    this.emit('disconnected');
                });

            } catch (error) {
                logger.error(`[Doubao AI] 连接失败: ${error.message}`);
                reject(error);
            }
        });
    }

    /**
     * 处理接收到的消息
     * @param {Buffer} data - 消息数据
     */
    handleMessage(data) {
        try {
            // 尝试解析JSON格式消息
            const message = JSON.parse(data.toString());
            logger.debug(`[Doubao AI] 收到消息: ${JSON.stringify(message).substring(0, 100)}`);

            const eventType = message.type || message.event;

            switch (eventType) {
                case 'session.created':
                    this.sessionId = message.session?.id;
                    logger.info(`[Doubao AI] 会话已创建: ${this.sessionId}`);
                    break;

                case 'response.text.delta':
                    // AI生成的文本片段
                    this.emit('text-delta', message.delta || message.text);
                    break;

                case 'response.text.done':
                    // AI文本生成完成
                    this.emit('text-done', message.text);
                    break;

                case 'response.audio.delta':
                    // 语音数据片段
                    this.emit('audio-delta', message.delta);
                    break;

                case 'response.audio.done':
                    // 语音生成完成
                    this.emit('audio-done');
                    break;

                case 'conversation.item.created':
                    logger.debug('[Doubao AI] 对话项已创建');
                    break;

                case 'error':
                    logger.error(`[Doubao AI] API错误: ${message.error?.message || JSON.stringify(message)}`);
                    this.emit('api-error', message.error);
                    break;

                default:
                    logger.debug(`[Doubao AI] 未处理的消息类型: ${eventType}`);
            }

        } catch (error) {
            // 如果不是JSON，可能是二进制数据
            logger.debug(`[Doubao AI] 收到二进制数据: ${data.length} bytes`);
            this.emit('binary-data', data);
        }
    }

    /**
     * 发送文本问题并获取AI回答
     * @param {string} question - 问题文本
     * @param {Object} context - 上下文信息
     * @returns {Promise<Object>} - { text: string, audio: Buffer }
     */
    async askQuestion(question, context = {}) {
        if (!this.isConnected) {
            logger.warn('[Doubao AI] 未连接，尝试重新连接...');
            await this.connect();
        }

        logger.info(`[Doubao AI] 提问: ${question}`);

        return new Promise((resolve, reject) => {
            const requestId = Date.now().toString();
            let textResponse = '';
            const audioChunks = [];

            // 超时处理
            const timeout = setTimeout(() => {
                this.removeAllListeners('text-delta');
                this.removeAllListeners('text-done');
                this.removeAllListeners('audio-delta');
                this.removeAllListeners('audio-done');
                reject(new Error('AI回答超时'));
            }, 30000); // 30秒超时

            // 监听文本片段
            const textDeltaHandler = (delta) => {
                textResponse += delta;
            };

            // 监听文本完成
            const textDoneHandler = (fullText) => {
                logger.info(`[Doubao AI] 文本回答完成: ${fullText?.substring(0, 50)}...`);
                textResponse = fullText || textResponse;
            };

            // 监听音频片段
            const audioDeltaHandler = (delta) => {
                if (delta) {
                    audioChunks.push(Buffer.from(delta));
                }
            };

            // 监听音频完成
            const audioDoneHandler = () => {
                clearTimeout(timeout);

                // 清理监听器
                this.removeListener('text-delta', textDeltaHandler);
                this.removeListener('text-done', textDoneHandler);
                this.removeListener('audio-delta', audioDeltaHandler);
                this.removeListener('audio-done', audioDoneHandler);

                const audioBuffer = audioChunks.length > 0 ? Buffer.concat(audioChunks) : null;

                logger.info(`[Doubao AI] ✅ AI回答完成，文本长度: ${textResponse.length}, 音频: ${audioBuffer ? audioBuffer.length + ' bytes' : '无'}`);

                resolve({
                    text: textResponse,
                    audio: audioBuffer
                });
            };

            // 绑定事件监听
            this.on('text-delta', textDeltaHandler);
            this.on('text-done', textDoneHandler);
            this.on('audio-delta', audioDeltaHandler);
            this.on('audio-done', audioDoneHandler);

            // 构建系统提示词
            const systemPrompt = `你是一名专业、热情的旅游导游助手。你的职责是回答游客关于景点的问题。

当前景点信息:
- 名称: ${context.currentSpot?.name || '未知'}
- 分类: ${context.currentSpot?.category || '未知'}

回答要求:
1. 语气友好、热情、专业
2. 回答简洁明了，不超过100字
3. 如果不确定答案，诚实告知并建议询问主播
4. 突出景点的特色和亮点`;

            // 发送对话请求（纯文本模式）
            try {
                const requestMessage = {
                    type: 'conversation.item.create',
                    item: {
                        type: 'message',
                        role: 'user',
                        content: [
                            {
                                type: 'input_text',
                                text: `${systemPrompt}\n\n游客问题: ${question}`
                            }
                        ]
                    }
                };

                logger.debug(`[Doubao AI] 发送请求: ${JSON.stringify(requestMessage).substring(0, 200)}`);
                this.ws.send(JSON.stringify(requestMessage));

                // 触发响应生成
                this.ws.send(JSON.stringify({
                    type: 'response.create'
                }));

            } catch (error) {
                clearTimeout(timeout);
                this.removeListener('text-delta', textDeltaHandler);
                this.removeListener('text-done', textDoneHandler);
                this.removeListener('audio-delta', audioDeltaHandler);
                this.removeListener('audio-done', audioDoneHandler);
                reject(error);
            }
        });
    }

    /**
     * 断开连接
     */
    disconnect() {
        if (this.ws) {
            logger.info('[Doubao AI] 断开连接');
            this.ws.close();
            this.ws = null;
            this.isConnected = false;
            this.sessionId = null;
        }
    }

    /**
     * 检查连接状态
     */
    checkStatus() {
        return {
            isConnected: this.isConnected,
            sessionId: this.sessionId,
            readyState: this.ws ? this.ws.readyState : null
        };
    }
}

module.exports = DoubaoAIService;
