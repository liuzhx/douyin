const winston = require('winston');
const path = require('path');
const fs = require('fs');
const config = require('config');

// 确保logs目录存在
const logsDir = config.get('logging.directory') || './logs';
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// 日志格式
const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, stack }) => {
        const logMessage = `[${timestamp}] ${level.toUpperCase()}: ${message}`;
        return stack ? `${logMessage}\n${stack}` : logMessage;
    })
);

// 创建logger实例
const logger = winston.createLogger({
    level: config.get('logging.level') || 'info',
    format: logFormat,
    transports: [
        // 控制台输出（带颜色）
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                logFormat
            )
        }),
        // 文件输出 - 所有日志
        new winston.transports.File({
            filename: path.join(logsDir, 'app.log'),
            maxsize: parseInt(config.get('logging.maxSize')) || 10485760, // 10MB
            maxFiles: config.get('logging.maxFiles') || 7
        }),
        // 文件输出 - 仅错误
        new winston.transports.File({
            filename: path.join(logsDir, 'error.log'),
            level: 'error',
            maxsize: parseInt(config.get('logging.maxSize')) || 10485760,
            maxFiles: config.get('logging.maxFiles') || 7
        })
    ]
});

module.exports = logger;
