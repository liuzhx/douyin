const EventEmitter = require('events');
const config = require('config');
const logger = require('../utils/logger');
const { extractKeywords, calculateSimilarity } = require('../utils/question-detector');

/**
 * 问答引擎
 * 处理观众问题，匹配预设答案或调用AI生成回答
 */
class QAEngine extends EventEmitter {
    constructor(spotNarrator) {
        super();
        this.spotNarrator = spotNarrator;
        this.questionHistory = [];
        this.dedupWindowMinutes = config.get('qa.dedupWindowMinutes') || 10;
        this.maxHistorySize = config.get('qa.maxHistorySize') || 100;
    }

    /**
     * 处理问题
     * @param {Object} question - 问题对象
     * @param {string} question.user - 提问用户
     * @param {string} question.content - 问题内容
     * @param {number} question.timestamp - 时间戳
     */
    async handleQuestion(question) {
        logger.info(`[问答引擎] 处理问题: ${question.content} (用户: ${question.user})`);

        // 1. 检查是否为重复问题
        if (this.isDuplicateQuestion(question.content)) {
            logger.info(`[问答引擎] 检测到重复问题，跳过: ${question.content}`);
            this.emit('duplicate-question', question);
            return;
        }

        // 2. 尝试匹配预设答案
        const presetAnswer = this.findPresetAnswer(question.content);

        if (presetAnswer) {
            logger.info(`[问答引擎] 找到预设答案: ${presetAnswer.spot} - ${presetAnswer.keyword}`);

            this.emit('answer', {
                question: question,
                answer: presetAnswer.answer,
                source: 'preset',
                spot: presetAnswer.spot
            });

            // 记录问题历史
            this.addToHistory(question.content);
            return;
        }

        // 3. 调用AI生成答案
        logger.info('[问答引擎] 未找到预设答案，将调用AI生成');

        this.emit('need-ai-answer', {
            question: question,
            context: this.buildContext()
        });

        // 记录问题历史
        this.addToHistory(question.content);
    }

    /**
     * 在知识库中查找预设答案
     * @param {string} questionText - 问题文本
     * @returns {Object|null} - 匹配的答案对象或null
     */
    findPresetAnswer(questionText) {
        const keywords = extractKeywords(questionText);

        if (keywords.length === 0) {
            logger.debug('[问答引擎] 未提取到有效关键词');
            return null;
        }

        logger.debug(`[问答引擎] 提取的关键词: ${keywords.join(', ')}`);

        // 遍历所有景点的知识库
        const allSpots = this.spotNarrator.getAllSpots();

        for (const spotInfo of allSpots) {
            const spot = this.spotNarrator.getSpotByName(spotInfo.name);

            if (!spot || !spot.qa_knowledge) continue;

            // 遍历该景点的所有Q&A
            for (const [keyword, answer] of Object.entries(spot.qa_knowledge)) {
                // 检查问题是否包含关键词
                if (questionText.includes(keyword)) {
                    return {
                        spot: spot.name,
                        keyword: keyword,
                        answer: answer
                    };
                }

                // 或者检查提取的关键词是否匹配
                for (const extractedKeyword of keywords) {
                    if (keyword.includes(extractedKeyword) || extractedKeyword.includes(keyword)) {
                        return {
                            spot: spot.name,
                            keyword: keyword,
                            answer: answer
                        };
                    }
                }
            }
        }

        return null;
    }

    /**
     * 检查是否为重复问题
     * @param {string} questionText - 问题文本
     * @returns {boolean} - 是否重复
     */
    isDuplicateQuestion(questionText) {
        const now = Date.now();
        const windowMs = this.dedupWindowMinutes * 60 * 1000;

        // 清理过期历史
        this.questionHistory = this.questionHistory.filter(
            item => (now - item.timestamp) < windowMs
        );

        // 检查相似度
        for (const historyItem of this.questionHistory) {
            const similarity = calculateSimilarity(questionText, historyItem.content);

            if (similarity > 0.8) {
                logger.debug(`[问答引擎] 发现相似问题 (相似度: ${similarity.toFixed(2)}): ${historyItem.content}`);
                return true;
            }
        }

        return false;
    }

    /**
     * 添加到问题历史
     * @param {string} questionText - 问题文本
     */
    addToHistory(questionText) {
        this.questionHistory.push({
            content: questionText,
            timestamp: Date.now()
        });

        // 限制历史记录大小
        if (this.questionHistory.length > this.maxHistorySize) {
            this.questionHistory.shift();
        }
    }

    /**
     * 构建上下文信息（供AI使用）
     * @returns {Object} - 上下文对象
     */
    buildContext() {
        const currentSpot = this.spotNarrator.getCurrentSpot();

        return {
            currentSpot: currentSpot ? {
                name: currentSpot.name,
                category: currentSpot.category,
                knowledge: currentSpot.qa_knowledge
            } : null,
            allSpots: this.spotNarrator.getAllSpots(),
            recentQuestions: this.questionHistory.slice(-5)
        };
    }

    /**
     * 处理AI生成的答案
     * @param {Object} data - AI答案数据
     */
    handleAIAnswer(data) {
        this.emit('answer', {
            question: data.question,
            answer: data.answer,
            source: 'ai',
            spot: data.spot || null
        });
    }

    /**
     * 清空问题历史
     */
    clearHistory() {
        logger.info('[问答引擎] 清空问题历史');
        this.questionHistory = [];
    }

    /**
     * 获取历史统计
     */
    getStats() {
        return {
            historySize: this.questionHistory.length,
            oldestQuestion: this.questionHistory.length > 0
                ? new Date(this.questionHistory[0].timestamp).toISOString()
                : null,
            newestQuestion: this.questionHistory.length > 0
                ? new Date(this.questionHistory[this.questionHistory.length - 1].timestamp).toISOString()
                : null
        };
    }
}

module.exports = QAEngine;
