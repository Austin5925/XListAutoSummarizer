// src/processors/dataCollector.js
const twitterService = require("../services/twitter");
const fileStorage = require("../storage/fileStorage");
const logger = require("../utils/logger");

class DataCollector {
  // 获取并保存推文
  async collectAndStoreTweets() {
    try {
      logger.info("开始收集Twitter数据");

      // 获取指定列表的最新推文
      const tweets = await twitterService.getListTweets();

      if (tweets.length === 0) {
        logger.warn("未找到推文，流程终止");
        return [];
      }

      // 保存推文到本地
      await fileStorage.saveTweets(tweets);

      return tweets;
    } catch (error) {
      logger.error("收集推文失败", { error: error.message });
      throw error;
    }
  }

  // 从存储获取推文
  async getStoredTweets() {
    return await fileStorage.getLatestTweets();
  }
}

module.exports = new DataCollector();
