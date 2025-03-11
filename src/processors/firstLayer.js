// src/processors/firstLayer.js
const config = require("../config");
const openaiService = require("../services/openai");
const fileStorage = require("../storage/fileStorage");
const logger = require("../utils/logger");

class FirstLayerProcessor {
  // 将推文分块并进行第一层分析
  async processInChunks(tweets) {
    try {
      logger.info(`开始第一层分析，共${tweets.length}条推文`);

      // 分块
      const chunks = this.chunkArray(tweets, config.openai.chunkSize);
      logger.info(`将推文分为${chunks.length}块处理`);

      // 分析每个块
      const analysisResults = [];

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        logger.info(
          `分析第${i + 1}/${chunks.length}块，包含${chunk.length}条推文`
        );

        try {
          const result = await openaiService.analyzeChunk(chunk);

          // 添加原始推文信息
          if (result.relevant_tweets && result.relevant_tweets.length > 0) {
            result.relevant_tweets.forEach((tweet) => {
              const originalIndex = tweet.index - 1;
              if (originalIndex >= 0 && originalIndex < chunk.length) {
                tweet.original_tweet = chunk[originalIndex];
              }
            });
          }

          analysisResults.push(result);

          // 添加延迟避免限流
          if (i < chunks.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        } catch (error) {
          logger.error(`第${i + 1}块分析失败`, { error: error.message });
          continue; // 继续处理其他块
        }
      }

      // 保存分析结果
      await fileStorage.saveFirstLayerAnalysis(analysisResults);

      return analysisResults;
    } catch (error) {
      logger.error("第一层分析失败", { error: error.message });
      throw error;
    }
  }

  // 数组分块
  chunkArray(array, chunkSize) {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  // 获取第一层分析结果
  async getAnalysisResults() {
    return await fileStorage.getFirstLayerAnalysis();
  }
}

module.exports = new FirstLayerProcessor();
