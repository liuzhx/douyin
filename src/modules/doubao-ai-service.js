const axios = require('axios');
const EventEmitter = require('events');
const config = require('config');
const logger = require('../utils/logger');

/**
 * Doubao AI服务 - HTTP版本
 * 使用火山引擎豆包大模型的HTTP API
 */
class DoubaoAIService extends EventEmitter {
    constructor() {
        super();
        this.apiUrl = config.get('doubao.apiUrl');
        this.apiKey = config.get('doubao.apiKey');
        this.model = config.get('doubao.model') || 'doubao-pro-4k';
    }

    /**
     * 连接（HTTP版本不需要持久连接）
     */
    async connect() {
        logger.info('[Doubao AI] HTTP API模式，无需建立连接');
        this.emit('connected');
        return Promise.resolve();
    }

    /**
     * 发送问题并获取AI回答
     * @param {string} question - 问题文本
     * @param {Object} context - 上下文信息
     * @returns {Promise<Object>} - { text: string }
     */
    async askQuestion(question, context = {}) {
        logger.info(`[Doubao AI] 提问: ${question}`);

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

        // 构建请求
        const requestBody = {
            model: this.model,
            messages: [
                {
                    role: 'system',
                    content: systemPrompt
                },
                {
                    role: 'user',
                    content: question
                }
            ],
            temperature: 0.7,
            max_tokens: 200
        };

        try {
            logger.debug(`[Doubao AI] 发送HTTP请求: ${this.apiUrl}`);

            const response = await axios.post(this.apiUrl, requestBody, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                timeout: 30000
            });

            if (response.data && response.data.choices && response.data.choices.length > 0) {
                const answer = response.data.choices[0].message.content;
                logger.info(`[Doubao AI] ✅ AI回答: ${answer.substring(0, 50)}...`);

                return {
                    text: answer,
                    audio: null  // HTTP API不返回音频
                };
            } else {
                logger.warn('[Doubao AI] API返回了空响应');
                return {
                    text: '很抱歉，我暂时无法回答这个问题。请稍后向主播咨询。',
                    audio: null
                };
            }

        } catch (error) {
            logger.error(`[Doubao AI] API调用失败: ${error.message}`);

            if (error.response) {
                logger.error(`[Doubao AI] 响应状态: ${error.response.status}`);
                logger.error(`[Doubao AI] 响应数据: ${JSON.stringify(error.response.data)}`);
            }

            throw error;
        }
    }

    /**
     * 断开连接（HTTP版本无需操作）
     */
    disconnect() {
        logger.info('[Doubao AI] HTTP API模式，无需断开连接');
    }

    /**
     * 检查连接状态
     */
    checkStatus() {
        return {
            isConnected: true,  // HTTP API总是可用
            apiUrl: this.apiUrl,
            model: this.model
        };
    }
}

module.exports = DoubaoAIService;
