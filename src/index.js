const config = require('config');
const logger = require('./utils/logger');
const BarrageListener = require('./modules/barrage-listener');
const SpotNarrator = require('./modules/spot-narrator');
const QAEngine = require('./modules/qa-engine');
const VoiceSynthesizer = require('./modules/voice-synthesizer');
const AudioPlayer = require('./modules/audio-player');
const DoubaoAIService = require('./modules/doubao-ai-service');

/**
 * 主应用程序
 */
class DouyinLiveAssistant {
    constructor() {
        this.barrageListener = null;
        this.spotNarrator = null;
        this.qaEngine = null;
        this.voiceSynthesizer = null;
        this.audioPlayer = null;
    }

    /**
     * 初始化所有模块
     */
    async initialize() {
        logger.info('========================================');
        logger.info('🎙️  旅游直播间AI助手 启动中...');
        logger.info('========================================');

        try {
            // 1. 初始化景点讲解模块
            logger.info('[初始化] 景点讲解模块...');
            this.spotNarrator = new SpotNarrator();
            await this.spotNarrator.initialize();

            // 2. 初始化问答引擎
            logger.info('[初始化] 问答引擎...');
            this.qaEngine = new QAEngine(this.spotNarrator);

            // 3. 初始化Doubao AI服务
            logger.info('[初始化] Doubao AI服务...');
            this.doubaoAIService = new DoubaoAIService();
            await this.doubaoAIService.connect();

            // 4. 初始化声音复刻模块
            logger.info('[初始化] 声音复刻模块...');
            const VoiceCloningService = require('./modules/voice-cloning-service');
            this.voiceSynthesizer = new VoiceCloningService();
            await this.voiceSynthesizer.connect();

            // 5. 初始化音频播放模块
            logger.info('[初始化] 音频播放模块...');
            this.audioPlayer = new AudioPlayer();

            // 6. 初始化弹幕监听模块
            logger.info('[初始化] 弹幕监听模块...');
            this.barrageListener = new BarrageListener();

            // 绑定事件
            this.bindEvents();

            logger.info('[初始化] ✅ 所有模块初始化完成');

        } catch (error) {
            logger.error(`[初始化] ❌ 初始化失败: ${error.message}`);
            throw error;
        }
    }

    /**
     * 绑定各模块事件
     */
    bindEvents() {
        // 弹幕监听 -> 问答引擎
        this.barrageListener.on('question', async (question) => {
            logger.info(`[事件] 收到问题: ${question.content}`);

            // 暂停讲解
            this.spotNarrator.pause();

            // 处理问题
            await this.qaEngine.handleQuestion(question);
        });

        // 问答引擎 -> 语音合成 -> 音频播放
        this.qaEngine.on('answer', async (data) => {
            logger.info(`[事件] 生成答案: ${data.answer.substring(0, 50)}...`);

            try {
                // 合成语音
                const audioBuffer = await this.voiceSynthesizer.synthesize(data.answer);

                // 播放(高优先级)
                await this.audioPlayer.play(audioData, {
                    priority: 'high',
                    type: 'qa'
                });

            } catch (error) {
                logger.error(`[事件] 答案语音合成失败: ${error.message}`);
            }
        });

        // 问答引擎 -> AI生成(需要时)
        this.qaEngine.on('need-ai-answer', async (data) => {
            logger.info('[事件] 需要AI生成答案');

            // TODO: 调用Doubao大模型API生成答案
            // 这里提供一个简化示例
            const aiAnswer = await this.generateAIAnswer(data.question, data.context);

            this.qaEngine.handleAIAnswer({
                question: data.question,
                answer: aiAnswer,
                spot: data.context.currentSpot?.name
            });
        });

        // 景点讲解 -> 语音合成 -> 音频播放
        this.spotNarrator.on('narrate', async (data) => {
            logger.info(`[事件] 开始讲解: ${data.spot.name} - ${data.title}`);

            try {
                // 合成语音
                const audioBuffer = await this.voiceSynthesizer.synthesize(data.content);

                // 播放(普通优先级)
                await this.audioPlayer.play(audioData, {
                    priority: 'normal',
                    type: 'narration'
                });

            } catch (error) {
                logger.error(`[事件] 讲解语音合成失败: ${error.message}`);
            }
        });

        // 音频播放完成 -> 恢复讲解或继续连续播放
        this.audioPlayer.on('play-end', (data) => {
            if (data.type === 'qa') {
                // 问答播放完成，恢复讲解
                logger.info('[事件] 问答播放完成，恢复讲解');
                this.spotNarrator.resume();
            } else if (data.type === 'narration') {
                // 讲解播放完成
                // 如果是连续播放模式（intervalMinutes为0）且未暂停，立即播放下一段
                const narratorConfig = config.get('narrator');
                if (narratorConfig.intervalMinutes === 0 && !this.spotNarrator.isPaused) {
                    logger.debug('[事件] 连续播放模式，立即播放下一段');
                    setTimeout(() => this.spotNarrator.playNext(), 500);  // 短暂延迟避免过快
                }
            }
        });

        // 弹幕连接状态
        this.barrageListener.on('connected', () => {
            logger.info('[事件] ✅ 弹幕监听已连接');
        });

        this.barrageListener.on('disconnected', () => {
            logger.warn('[事件] ⚠️  弹幕监听已断开');
        });

        this.barrageListener.on('max-reconnect-reached', () => {
            logger.error('[事件] ❌ 弹幕监听达到最大重连次数');
        });
    }

    /**
     * AI答案生成(简化版)
     * 实际应该调用Doubao大模型API
     * @param {Object} question - 问题对象
     * @param {Object} context - 上下文
     * @returns {Promise<string>} - 答案文本
     */
    async generateAIAnswer(question, context) {
        logger.info('[AI生成] 生成答案中...');

        try {
            // 调用Doubao AI服务生成答案
            const result = await this.doubaoAIService.askQuestion(question.content, context);

            if (result && result.text) {
                logger.info(`[AI生成] ✅ AI回答: ${result.text.substring(0, 50)}...`);
                return result.text;
            } else {
                logger.warn('[AI生成] AI返回了空答案');
                return `很抱歉，我暂时无法回答这个问题。请稍后向主播咨询。`;
            }

        } catch (error) {
            logger.error(`[AI生成] 生成答案失败: ${error.message}`);
            return `很抱歉，我暂时无法回答这个问题。请稍后向主播咨询，或者在评论区留言。`;
        }
    }

    /**
     * 启动应用
     */
    async start() {
        logger.info('[启动] 正在启动所有服务...');

        // 连接弹幕监听
        this.barrageListener.connect();

        // 启动景点讲解
        if (config.get('narrator.autoStart') !== false) {
            this.spotNarrator.start();
        }

        logger.info('========================================');
        logger.info('✅ 系统已启动，正在运行中...');
        logger.info('========================================');
        logger.info('');
        logger.info('💡 提示:');
        logger.info('  1. 确保 DouyinBarrageGrab 已启动');
        logger.info('  2. 打开抖音直播间，发送测试弹幕');
        logger.info('  3. 查看日志输出确认功能正常');
        logger.info('');
        logger.info('按 Ctrl+C 停止程序');
        logger.info('========================================');
    }

    /**
     * 停止应用
     */
    async stop() {
        logger.info('[停止] 正在关闭所有服务...');

        if (this.spotNarrator) {
            this.spotNarrator.stop();
        }

        if (this.barrageListener) {
            this.barrageListener.disconnect();
        }

        if (this.voiceSynthesizer) {
            this.voiceSynthesizer.disconnect();
        }

        if (this.audioPlayer) {
            this.audioPlayer.stop();
        }

        logger.info('[停止] ✅ 所有服务已关闭');
    }
}

// 创建应用实例
const app = new DouyinLiveAssistant();

// 启动应用
(async () => {
    try {
        await app.initialize();
        await app.start();
    } catch (error) {
        logger.error(`应用启动失败: ${error.message}`);
        process.exit(1);
    }
})();

// 优雅退出
process.on('SIGINT', async () => {
    logger.info('');
    logger.info('收到退出信号...');
    await app.stop();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    logger.info('收到终止信号...');
    await app.stop();
    process.exit(0);
});

module.exports = DouyinLiveAssistant;
