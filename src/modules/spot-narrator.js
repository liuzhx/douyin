const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');
const config = require('config');
const logger = require('../utils/logger');

/**
 * 景点讲解模块
 * 管理景点讲解词，定时自动播放
 */
class SpotNarrator extends EventEmitter {
    constructor() {
        super();
        this.spots = [];
        this.currentSpotIndex = 0;
        this.currentScriptIndex = 0;
        this.isPaused = false;
        this.intervalTimer = null;

        this.mode = config.get('narrator.mode') || 'sequential'; // sequential | random
        this.intervalMinutes = config.get('narrator.intervalMinutes') || 5;
        this.autoStart = config.get('narrator.autoStart') !== false;
        this.scriptsDirectory = config.get('narrator.scriptsDirectory') || './data/scripts';
    }

    /**
     * 初始化：加载所有景点讲解词
     */
    async initialize() {
        logger.info('[景点讲解] 正在加载景点讲解词...');

        try {
            const scriptsDir = path.resolve(this.scriptsDirectory);

            if (!fs.existsSync(scriptsDir)) {
                logger.warn(`[景点讲解] 讲解词目录不存在，创建目录: ${scriptsDir}`);
                fs.mkdirSync(scriptsDir, { recursive: true });
                return;
            }

            const files = fs.readdirSync(scriptsDir)
                .filter(file => file.endsWith('.json'))
                .sort();

            for (const file of files) {
                const filePath = path.join(scriptsDir, file);
                try {
                    const content = fs.readFileSync(filePath, 'utf-8');
                    const spot = JSON.parse(content);

                    // 验证必要字段
                    if (spot.id && spot.name && spot.scripts && spot.scripts.length > 0) {
                        this.spots.push(spot);
                        logger.info(`[景点讲解] 已加载: ${spot.name} (${spot.scripts.length}段讲解)`);
                    } else {
                        logger.warn(`[景点讲解] 文件格式错误，跳过: ${file}`);
                    }
                } catch (error) {
                    logger.error(`[景点讲解] 加载文件失败 ${file}: ${error.message}`);
                }
            }

            if (this.spots.length === 0) {
                logger.warn('[景点讲解] 未找到有效的讲解词文件');
            } else {
                logger.info(`[景点讲解] 共加载 ${this.spots.length} 个景点讲解词`);
            }

        } catch (error) {
            logger.error(`[景点讲解] 初始化失败: ${error.message}`);
        }
    }

    /**
     * 开始自动讲解
     */
    start() {
        if (this.spots.length === 0) {
            logger.warn('[景点讲解] 没有可用的讲解词，无法开始');
            return;
        }

        if (this.intervalTimer) {
            logger.warn('[景点讲解] 已经在运行中');
            return;
        }

        // 支持连续播放模式（intervalMinutes为0）
        if (this.intervalMinutes === 0) {
            logger.info(`[景点讲解] 开始连续讲解模式，模式: ${this.mode}`);
            logger.info('[景点讲解] 提示: 连续播放模式下，讲解会无间隔连续播放');
        } else {
            logger.info(`[景点讲解] 开始自动讲解，间隔: ${this.intervalMinutes}分钟，模式: ${this.mode}`);
        }

        // 立即播放第一段
        if (this.autoStart) {
            setTimeout(() => this.playNext(), 2000);
        }

        // 只有在非连续模式下才设置定时器
        if (this.intervalMinutes > 0) {
            this.intervalTimer = setInterval(() => {
                if (!this.isPaused) {
                    this.playNext();
                }
            }, this.intervalMinutes * 60 * 1000);
        }

        this.emit('started');
    }

    /**
     * 停止自动讲解
     */
    stop() {
        logger.info('[景点讲解] 停止自动讲解');

        if (this.intervalTimer) {
            clearInterval(this.intervalTimer);
            this.intervalTimer = null;
        }

        this.emit('stopped');
    }

    /**
     * 暂停讲解
     */
    pause() {
        if (!this.isPaused) {
            logger.info('[景点讲解] 暂停讲解');
            this.isPaused = true;
            this.emit('paused');
        }
    }

    /**
     * 恢复讲解
     */
    resume() {
        if (this.isPaused) {
            logger.info('[景点讲解] 恢复讲解');
            this.isPaused = false;
            this.emit('resumed');
        }
    }

    /**
     * 播放下一段讲解
     */
    playNext() {
        if (this.spots.length === 0) return;

        const script = this.getNextScript();

        if (script) {
            logger.info(`[景点讲解] 播放讲解: ${script.spot.name} - ${script.content.title}`);

            this.emit('narrate', {
                spot: script.spot,
                content: script.content.content,
                title: script.content.title,
                duration: script.content.duration_seconds
            });
        }
    }

    /**
     * 获取下一段讲解
     * @returns {Object} - { spot, content }
     */
    getNextScript() {
        if (this.spots.length === 0) return null;

        let spot;
        let scriptIndex;

        if (this.mode === 'random') {
            // 随机模式
            const spotIndex = Math.floor(Math.random() * this.spots.length);
            spot = this.spots[spotIndex];
            scriptIndex = Math.floor(Math.random() * spot.scripts.length);
        } else {
            // 顺序模式
            spot = this.spots[this.currentSpotIndex];
            scriptIndex = this.currentScriptIndex;

            // 移动到下一段
            this.currentScriptIndex++;
            if (this.currentScriptIndex >= spot.scripts.length) {
                this.currentScriptIndex = 0;
                this.currentSpotIndex++;
                if (this.currentSpotIndex >= this.spots.length) {
                    this.currentSpotIndex = 0;
                }
            }
        }

        return {
            spot: spot,
            content: spot.scripts[scriptIndex]
        };
    }

    /**
     * 根据景点名称获取景点信息
     * @param {string} spotName - 景点名称
     * @returns {Object|null} - 景点信息
     */
    getSpotByName(spotName) {
        return this.spots.find(spot =>
            spot.name === spotName || spot.name.includes(spotName)
        );
    }

    /**
     * 获取当前景点
     * @returns {Object|null} - 当前景点
     */
    getCurrentSpot() {
        if (this.spots.length === 0) return null;
        return this.spots[this.currentSpotIndex];
    }

    /**
     * 获取所有景点列表
     * @returns {Array} - 景点列表
     */
    getAllSpots() {
        return this.spots.map(spot => ({
            id: spot.id,
            name: spot.name,
            category: spot.category,
            scriptCount: spot.scripts.length
        }));
    }
}

module.exports = SpotNarrator;
