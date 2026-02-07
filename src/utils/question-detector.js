const config = require('config');

/**
 * 检测文本是否为问题
 * @param {string} text - 要检测的文本
 * @returns {boolean} - 是否为问题
 */
function isQuestion(text) {
    if (!text || typeof text !== 'string') {
        return false;
    }

    // 1. 包含问号
    if (text.includes('?') || text.includes('?')) {
        return true;
    }

    // 2. 包含疑问词
    const questionKeywords = config.get('qa.questionKeywords') || [
        '怎么', '如何', '多少', '哪里', '什么', '为什么', '吗', '呢'
    ];

    return questionKeywords.some(keyword => text.includes(keyword));
}

/**
 * 提取问题中的关键词
 * @param {string} question - 问题文本
 * @returns {string[]} - 关键词列表
 */
function extractKeywords(question) {
    // 简单的关键词提取（可以后续优化为NLP分词）
    const keywords = [];

    // 移除问号和无意义的助词，但保留量词和重要疑问词
    let cleanText = question.replace(/[?？]/g, '');
    const fillerWords = ['吗', '呢', '啊', '呀'];  // 只移除助词，保留多少、几个、什么等
    fillerWords.forEach(word => {
        cleanText = cleanText.replace(new RegExp(word, 'g'), '');
    });

    // 按空格和标点分词
    const words = cleanText.split(/[\s,，。！!、]/);

    // 过滤空词和短词
    words.forEach(word => {
        word = word.trim();
        if (word.length >= 2) {
            keywords.push(word);
        }
    });

    return keywords;
}

/**
 * 计算两个文本的相似度（简单版本）
 * @param {string} text1 
 * @param {string} text2 
 * @returns {number} - 0-1之间的相似度
 */
function calculateSimilarity(text1, text2) {
    if (!text1 || !text2) return 0;

    const str1 = text1.toLowerCase();
    const str2 = text2.toLowerCase();

    // 完全匹配
    if (str1 === str2) return 1;

    // 包含关系
    if (str1.includes(str2) || str2.includes(str1)) {
        const shorter = str1.length < str2.length ? str1 : str2;
        const longer = str1.length >= str2.length ? str1 : str2;
        return shorter.length / longer.length;
    }

    // 简单的字符相似度
    let matches = 0;
    for (let char of str1) {
        if (str2.includes(char)) matches++;
    }

    return matches / Math.max(str1.length, str2.length);
}

module.exports = {
    isQuestion,
    extractKeywords,
    calculateSimilarity
};
