const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const logger = require('../utils/logger');

// 尝试加载音频播放库（按优先级）
let audioBackend = null;
let backendType = 'none';

// 方法1: 尝试使用 speaker（原生模块）
try {
    const Speaker = require('speaker');
    audioBackend = { type: 'speaker', module: Speaker };
    backendType = 'speaker';
    console.log('[音频播放] ✅ 使用 Speaker 原生模块');
} catch (err) {
    console.log('[音频播放] Speaker未安装，尝试其他方案...');
}

// 方法2: 尝试使用 play-sound（纯JS，推荐Windows）
if (!audioBackend) {
    try {
        const player = require('play-sound')({});
        audioBackend = { type: 'play-sound', module: player };
        backendType = 'play-sound';
        console.log('[音频播放] ✅ 使用 play-sound 模块');
    } catch (err) {
        console.log('[音频播放] play-sound未安装，尝试其他方案...');
    }
}

// 方法3: 尝试使用 node-wav-player
if (!audioBackend) {
    try {
        const player = require('node-wav-player');
        audioBackend = { type: 'wav-player', module: player };
        backendType = 'wav-player';
        console.log('[音频播放] ✅ 使用 node-wav-player 模块');
    } catch (err) {
        console.log('[音频播放] node-wav-player未安装，尝试其他方案...');
    }
}

// 方法4: 使用系统命令（PowerShell/ffplay）作为备选
if (!audioBackend) {
    audioBackend = { type: 'system', module: null };
    backendType = 'system';
    console.log('[音频播放] ⚠️  使用系统命令播放（PowerShell）');
    console.log('[音频播放] 💡 建议安装: npm install play-sound');
}

/**
 * Windows音频播放模块（多后端支持）
 * 支持: speaker, play-sound, node-wav-player, 系统命令
 */
class AudioPlayerWindows extends EventEmitter {
    constructor() {
        super();
        this.queue = [];
        this.isPlaying = false;
        this.currentSpeaker = null;
        this.backendType = backendType;
        this.tempDir = path.join(__dirname, '../../temp-audio');

        // 默认音频格式 (PCM)
        this.audioFormat = {
            channels: 1,          // 单声道
            bitDepth: 16,         // 16位
            sampleRate: 16000     // 16kHz
        };

        // 创建临时目录
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }

        logger.info(`[音频播放] 后端类型: ${this.backendType}`);
    }

    /**
     * 添加音频到播放队列
     * @param {Buffer} audioData - 音频数据（PCM格式）
     * @param {Object} options - 选项
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
            this.queue.unshift(audioItem);
            if (this.isPlaying && this.currentItem && this.currentItem.priority === 'normal') {
                logger.info('[音频播放] 检测到高优先级音频，暂停当前播放');
                this.pause();
            }
        } else {
            this.queue.push(audioItem);
        }

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

            await this.processQueue();

        } catch (error) {
            logger.error(`[音频播放] 播放失败: ${error.message}`);
            this.emit('play-error', error);

            this.isPlaying = false;
            await this.processQueue();
        }
    }

    /**
     * 播放音频数据（多后端支持）
     * @param {Buffer} audioData - 音频数据
     * @param {Object} format - 音频格式
     * @returns {Promise<void>}
     */
    async playAudio(audioData, format) {
        switch (this.backendType) {
            case 'speaker':
                return this.playSpeaker(audioData, format);
            case 'play-sound':
                return this.playWithPlaySound(audioData, format);
            case 'wav-player':
                return this.playWithWavPlayer(audioData, format);
            case 'system':
                return this.playWithSystem(audioData, format);
            default:
                logger.warn('[音频播放] 没有可用的音频后端，跳过播放');
                return Promise.resolve();
        }
    }

    /**
     * 使用 Speaker 播放（原生模块）
     */
    playSpeaker(audioData, format) {
        return new Promise((resolve, reject) => {
            try {
                const Speaker = audioBackend.module;
                this.currentSpeaker = new Speaker({
                    channels: format.channels || this.audioFormat.channels,
                    bitDepth: format.bitDepth || this.audioFormat.bitDepth,
                    sampleRate: format.sampleRate || this.audioFormat.sampleRate
                });

                this.currentSpeaker.on('close', () => {
                    this.currentSpeaker = null;
                    resolve();
                });

                this.currentSpeaker.on('error', (error) => {
                    logger.error(`[音频播放] Speaker错误: ${error.message}`);
                    this.currentSpeaker = null;
                    reject(error);
                });

                this.currentSpeaker.write(audioData);
                this.currentSpeaker.end();

            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * 使用 play-sound 播放（推荐Windows方案）
     */
    async playWithPlaySound(audioData, format) {
        // 1. 将PCM数据转为WAV文件
        const wavFile = await this.pcmToWavFile(audioData, format);

        // 2. 使用play-sound播放
        return new Promise((resolve, reject) => {
            const player = audioBackend.module;
            player.play(wavFile, (err) => {
                // 清理临时文件
                try {
                    if (fs.existsSync(wavFile)) {
                        fs.unlinkSync(wavFile);
                    }
                } catch (cleanupErr) {
                    logger.warn(`[音频播放] 清理临时文件失败: ${cleanupErr.message}`);
                }

                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    /**
     * 使用 node-wav-player 播放
     */
    async playWithWavPlayer(audioData, format) {
        const wavFile = await this.pcmToWavFile(audioData, format);

        return new Promise((resolve, reject) => {
            const player = audioBackend.module;
            player.play({ path: wavFile })
                .then(() => {
                    // 清理临时文件
                    try {
                        if (fs.existsSync(wavFile)) {
                            fs.unlinkSync(wavFile);
                        }
                    } catch (err) {
                        logger.warn(`[音频播放] 清理临时文件失败: ${err.message}`);
                    }
                    resolve();
                })
                .catch((err) => {
                    reject(err);
                });
        });
    }

    /**
     * 使用系统命令播放（PowerShell备选方案）
     */
    async playWithSystem(audioData, format) {
        const wavFile = await this.pcmToWavFile(audioData, format);

        return new Promise((resolve, reject) => {
            // Windows PowerShell音频播放命令
            const psCommand = `
                Add-Type -AssemblyName System.Speech;
                $player = New-Object System.Media.SoundPlayer('${wavFile.replace(/\\/g, '\\\\')}');
                $player.PlaySync();
            `;

            // 尝试使用PowerShell
            exec(`powershell -Command "${psCommand}"`, (error, stdout, stderr) => {
                // 清理临时文件
                try {
                    if (fs.existsSync(wavFile)) {
                        fs.unlinkSync(wavFile);
                    }
                } catch (err) {
                    logger.warn(`[音频播放] 清理临时文件失败: ${err.message}`);
                }

                if (error) {
                    logger.error(`[音频播放] PowerShell播放失败: ${error.message}`);
                    // 尝试使用备用方案：直接调用mplay32
                    this.playWithMPlay32(wavFile).then(resolve).catch(reject);
                } else {
                    resolve();
                }
            });
        });
    }

    /**
     * 备用方案：使用Windows Media Player命令行
     */
    playWithMPlay32(wavFile) {
        return new Promise((resolve, reject) => {
            exec(`start /wait wmplayer "${wavFile}"`, (error) => {
                if (error) {
                    logger.error(`[音频播放] WMPlayer播放失败: ${error.message}`);
                    reject(error);
                } else {
                    resolve();
                }
            });
        });
    }

    /**
     * 将PCM数据转换为WAV文件
     * @param {Buffer} pcmData - PCM音频数据
     * @param {Object} format - 音频格式
     * @returns {Promise<string>} WAV文件路径
     */
    async pcmToWavFile(pcmData, format) {
        const filename = `audio_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.wav`;
        const wavPath = path.join(this.tempDir, filename);

        // 创建WAV头
        const header = this.createWavHeader(pcmData.length, format);
        const wavBuffer = Buffer.concat([header, pcmData]);

        // 写入文件
        fs.writeFileSync(wavPath, wavBuffer);

        return wavPath;
    }

    /**
     * 创建WAV文件头
     * @param {number} dataLength - PCM数据长度
     * @param {Object} format - 音频格式
     * @returns {Buffer} WAV头Buffer
     */
    createWavHeader(dataLength, format) {
        const channels = format.channels || this.audioFormat.channels;
        const sampleRate = format.sampleRate || this.audioFormat.sampleRate;
        const bitDepth = format.bitDepth || this.audioFormat.bitDepth;

        const header = Buffer.alloc(44);

        // RIFF标识符
        header.write('RIFF', 0);
        header.writeUInt32LE(36 + dataLength, 4);
        header.write('WAVE', 8);

        // fmt子块
        header.write('fmt ', 12);
        header.writeUInt32LE(16, 16); // fmt块大小
        header.writeUInt16LE(1, 20);  // 音频格式(1=PCM)
        header.writeUInt16LE(channels, 22);
        header.writeUInt32LE(sampleRate, 24);
        header.writeUInt32LE(sampleRate * channels * bitDepth / 8, 28); // 字节率
        header.writeUInt16LE(channels * bitDepth / 8, 32); // 块对齐
        header.writeUInt16LE(bitDepth, 34);

        // data子块
        header.write('data', 36);
        header.writeUInt32LE(dataLength, 40);

        return header;
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
            currentType: this.currentItem ? this.currentItem.type : null,
            backend: this.backendType
        };
    }

    /**
     * 清理临时文件
     */
    cleanup() {
        try {
            if (fs.existsSync(this.tempDir)) {
                const files = fs.readdirSync(this.tempDir);
                files.forEach(file => {
                    const filePath = path.join(this.tempDir, file);
                    try {
                        fs.unlinkSync(filePath);
                    } catch (err) {
                        logger.warn(`[音频播放] 删除临时文件失败: ${err.message}`);
                    }
                });
            }
        } catch (err) {
            logger.error(`[音频播放] 清理临时目录失败: ${err.message}`);
        }
    }
}

module.exports = AudioPlayerWindows;
