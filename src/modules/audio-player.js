const EventEmitter = require('events');
let Speaker;
try {
    Speaker = require('speaker');
} catch (err) {
    console.warn('[音频播放] Speaker模块未安装，音频播放功能将被禁用');
    console.warn('[音频播放] 如需启用，请安装Windows SDK并重新运行: npm install speaker');
}
const logger = require('../utils/logger');

/**
 * 音频播放模块
 * 管理音频播放队列，处理优先级
 */
class AudioPlayer extends EventEmitter {
    constructor() {
        super();
        this.queue = [];
        this.isPlaying = false;
        this.currentSpeaker = null;

        // 默认音频格式 (PCM) - 与TTS输出格式匹配
        this.audioFormat = {
            channels: 1,          // 单声道
            bitDepth: 16,         // 16位
            sampleRate: 24000     // 24kHz (与TTS输出匹配)
        };
    }

    /**
     * 添加音频到播放队列
     * @param {Buffer} audioData - 音频数据
     * @param {Object} options - 选项
     * @param {string} options.priority - 优先级: 'high' | 'normal'
     * @param {string} options.type - 类型: 'narration' | 'qa'
     * @param {Object} options.format - 音频格式(可选)
     */
    async play(audioData, options = {}) {
        const priority = options.priority || 'normal';
        const type = options.type || 'unknown';
        const format = options.format || this.audioFormat;

        logger.info(`[音频播放] 添加到队列: ${type}, 优先级: ${priority}, 大小: ${audioData.length} bytes`);

        const audioItem = {
            data: audioData,
            priority: priority,
            type: type,
            format: format,
            timestamp: Date.now()
        };

        if (priority === 'high') {
            // 高优先级插到队首
            this.queue.unshift(audioItem);

            // 如果正在播放普通优先级内容，暂停并插入
            if (this.isPlaying && this.currentItem && this.currentItem.priority === 'normal') {
                logger.info('[音频播放] 检测到高优先级音频，暂停当前播放');
                this.pause();
            }
        } else {
            // 普通优先级加到队尾
            this.queue.push(audioItem);
        }

        // 如果当前没有播放，开始播放
        if (!this.isPlaying) {
            await this.processQueue();
        }
    }

    /**
     * 处理播放队列
     */
    async processQueue() {
        if (this.queue.length === 0) {
            logger.debug('[音频播放] 队列为空');
            this.isPlaying = false;
            this.emit('queue-empty');
            return;
        }

        this.isPlaying = true;
        this.currentItem = this.queue.shift();

        logger.info(`[音频播放] 开始播放: ${this.currentItem.type}, 队列剩余: ${this.queue.length}`);

        this.emit('play-start', {
            type: this.currentItem.type,
            queueLength: this.queue.length
        });

        try {
            await this.playAudio(this.currentItem.data, this.currentItem.format);

            logger.info('[音频播放] 播放完成');
            this.emit('play-end', { type: this.currentItem.type });

            // 继续播放队列中的下一项
            await this.processQueue();

        } catch (error) {
            logger.error(`[音频播放] 播放失败: ${error.message}`);
            this.emit('play-error', error);

            // 发生错误后继续处理队列
            this.isPlaying = false;
            await this.processQueue();
        }
    }

    /**
     * 播放音频数据
     * @param {Buffer} audioData - 音频数据
     * @param {Object} format - 音频格式
     * @returns {Promise<void>}
     */
    playAudio(audioData, format) {
        return new Promise((resolve, reject) => {
            try {
                // 检查Speaker是否可用
                if (!Speaker) {
                    logger.warn('[音频播放] Speaker模块未安装，跳过音频播放');
                    logger.info('[音频播放] 提示: 安装Windows SDK后运行 npm install speaker 即可启用音频功能');
                    // 模拟播放延迟后直接返回
                    setTimeout(() => resolve(), 100);
                    return;
                }

                // 创建Speaker实例
                this.currentSpeaker = new Speaker({
                    channels: format.channels || this.audioFormat.channels,
                    bitDepth: format.bitDepth || this.audioFormat.bitDepth,
                    sampleRate: format.sampleRate || this.audioFormat.sampleRate
                });

                // 监听播放完成事件
                this.currentSpeaker.on('close', () => {
                    this.currentSpeaker = null;
                    resolve();
                });

                // 监听错误事件
                this.currentSpeaker.on('error', (error) => {
                    logger.error(`[音频播放] Speaker错误: ${error.message}`);
                    this.currentSpeaker = null;
                    reject(error);
                });

                // 写入音频数据
                this.currentSpeaker.write(audioData);
                this.currentSpeaker.end();

            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * 暂停当前播放
     */
    pause() {
        if (this.currentSpeaker) {
            logger.info('[音频播放] 暂停播放');

            try {
                this.currentSpeaker.end();
                this.currentSpeaker = null;
            } catch (error) {
                logger.error(`[音频播放] 暂停失败: ${error.message}`);
            }

            this.isPlaying = false;
            this.emit('paused');
        }
    }

    /**
     * 清空队列
     */
    clearQueue() {
        logger.info(`[音频播放] 清空队列 (${this.queue.length}项)`);
        this.queue = [];
        this.emit('queue-cleared');
    }

    /**
     * 停止播放并清空队列
     */
    stop() {
        logger.info('[音频播放] 停止播放');
        this.pause();
        this.clearQueue();
        this.emit('stopped');
    }

    /**
     * 获取队列状态
     */
    getStatus() {
        return {
            isPlaying: this.isPlaying,
            queueLength: this.queue.length,
            currentType: this.currentItem ? this.currentItem.type : null
        };
    }

    /**
     * 保存音频到文件(调试用)
     * @param {Buffer} audioData - 音频数据
     * @param {string} filename - 文件名
     */
    saveToFile(audioData, filename) {
        const fs = require('fs');
        const path = require('path');

        const dir = './audio-debug';
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        const filepath = path.join(dir, filename);
        fs.writeFileSync(filepath, audioData);
        logger.info(`[音频播放] 已保存音频: ${filepath}`);
    }
}

module.exports = AudioPlayer;
