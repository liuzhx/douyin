const WebSocket = require('ws');
const EventEmitter = require('events');
const config = require('config');
const logger = require('../utils/logger');
const { isQuestion } = require('../utils/question-detector');

/**
 * 弹幕监听模块
 * 连接DouyinBarrageGrab的WebSocket服务，监听弹幕消息
 */
class BarrageListener extends EventEmitter {
    constructor() {
        super();
        this.ws = null;
        this.reconnectTimer = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = config.get('barrage.maxReconnectAttempts') || 10;
        this.reconnectInterval = config.get('barrage.reconnectInterval') || 5000;
        this.wsUrl = config.get('barrage.wsUrl');
    }

    /**
     * 连接WebSocket服务
     */
    connect() {
        logger.info(`[弹幕监听] 正在连接 DouyinBarrageGrab: ${this.wsUrl}`);

        try {
            this.ws = new WebSocket(this.wsUrl);

            this.ws.on('open', () => {
                logger.info('[弹幕监听] WebSocket连接成功');
                this.reconnectAttempts = 0;
                this.emit('connected');
            });

            this.ws.on('message', (data) => {
                this.handleMessage(data);
            });

            this.ws.on('error', (error) => {
                logger.error(`[弹幕监听] WebSocket错误: ${error.message}`);
                this.emit('error', error);
            });

            this.ws.on('close', () => {
                logger.warn('[弹幕监听] WebSocket连接已关闭');
                this.emit('disconnected');
                this.scheduleReconnect();
            });

        } catch (error) {
            logger.error(`[弹幕监听] 连接失败: ${error.message}`);
            this.scheduleReconnect();
        }
    }

    /**
     * 处理接收到的消息
     * @param {Buffer} data - 消息数据
     */
    handleMessage(data) {
        try {
            const message = JSON.parse(data.toString());

            // 仅处理普通弹幕消息 (MsgType === 1)
            if (message.MsgType === 1 && message.Content) {
                const barrage = {
                    user: message.User?.Nickname || '匿名用户',
                    userId: message.User?.UserId || '',
                    content: message.Content,
                    timestamp: message.Timestamp || Date.now(),
                    isAdmin: message.User?.IsAdmin || false,
                    isAnchor: message.User?.IsAnchor || false
                };

                logger.debug(`[弹幕] ${barrage.user}: ${barrage.content}`);

                // 触发弹幕事件
                this.emit('barrage', barrage);

                // 检测是否为问题
                if (isQuestion(barrage.content)) {
                    logger.info(`[问题检测] ${barrage.user}: ${barrage.content}`);
                    this.emit('question', barrage);
                }
            }

            // 其他消息类型可根据需要处理
            // MsgType: 2=点赞, 3=进入, 4=关注, 5=礼物, 6=统计, 7=粉丝团, 8=分享, 9=下播

        } catch (error) {
            logger.error(`[弹幕监听] 消息解析失败: ${error.message}`);
        }
    }

    /**
     * 计划重连
     */
    scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            logger.error('[弹幕监听] 已达到最大重连次数，停止重连');
            this.emit('max-reconnect-reached');
            return;
        }

        this.reconnectAttempts++;
        logger.info(`[弹幕监听] ${this.reconnectInterval / 1000}秒后尝试第 ${this.reconnectAttempts} 次重连...`);

        this.reconnectTimer = setTimeout(() => {
            this.connect();
        }, this.reconnectInterval);
    }

    /**
     * 断开连接
     */
    disconnect() {
        logger.info('[弹幕监听] 正在断开连接...');

        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    /**
     * 获取连接状态
     */
    isConnected() {
        return this.ws && this.ws.readyState === WebSocket.OPEN;
    }
}

module.exports = BarrageListener;
