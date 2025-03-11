// src/storage/fileStorage.js
const fs = require("fs-extra");
const path = require("path");
const config = require("../config");
const logger = require("../utils/logger");

class FileStorage {
  constructor() {
    // 确保目录存在
    fs.ensureDirSync(config.paths.data);
    fs.ensureDirSync(config.paths.tweets);
    fs.ensureDirSync(config.paths.analysis);
  }

  // 获取日期字符串
  getTodayString() {
    return new Date().toISOString().split("T")[0];
  }

  // 保存原始推文
  async saveTweets(tweets) {
    try {
      const today = this.getTodayString();
      const filePath = path.join(config.paths.tweets, `${today}.json`);

      const dataToSave = {
        savedAt: new Date().toISOString(),
        count: tweets.length,
        tweets,
      };

      await fs.writeJson(filePath, dataToSave, { spaces: 2 });
      logger.info(`保存了${tweets.length}条推文到${filePath}`);
      return filePath;
    } catch (error) {
      logger.error("保存推文失败", { error: error.message });
      throw error;
    }
  }

  // 读取今天的推文
  async getLatestTweets() {
    try {
      const today = this.getTodayString();
      const filePath = path.join(config.paths.tweets, `${today}.json`);

      if (await fs.pathExists(filePath)) {
        const data = await fs.readJson(filePath);
        return data.tweets;
      }

      logger.warn(`未找到今天(${today})的推文`);
      return [];
    } catch (error) {
      logger.error("读取推文失败", { error: error.message });
      throw error;
    }
  }

  // 保存第一层分析结果
  async saveFirstLayerAnalysis(results) {
    try {
      const today = this.getTodayString();
      const filePath = path.join(
        config.paths.analysis,
        `${today}-first-layer.json`
      );

      const dataToSave = {
        savedAt: new Date().toISOString(),
        results,
      };

      await fs.writeJson(filePath, dataToSave, { spaces: 2 });
      logger.info(`保存第一层分析结果到${filePath}`);
      return filePath;
    } catch (error) {
      logger.error("保存第一层分析失败", { error: error.message });
      throw error;
    }
  }

  // 读取第一层分析
  async getFirstLayerAnalysis() {
    try {
      const today = this.getTodayString();
      const filePath = path.join(
        config.paths.analysis,
        `${today}-first-layer.json`
      );

      if (await fs.pathExists(filePath)) {
        const data = await fs.readJson(filePath);
        return data.results;
      }

      logger.warn(`未找到今天(${today})的第一层分析`);
      return [];
    } catch (error) {
      logger.error("读取第一层分析失败", { error: error.message });
      throw error;
    }
  }

  // 保存最终日报
  async saveFinalDigest(digest) {
    try {
      const today = this.getTodayString();
      const filePath = path.join(
        config.paths.analysis,
        `${today}-final-digest.json`
      );

      const dataToSave = {
        savedAt: new Date().toISOString(),
        digest,
      };

      await fs.writeJson(filePath, dataToSave, { spaces: 2 });
      logger.info(`保存最终日报到${filePath}`);
      return filePath;
    } catch (error) {
      logger.error("保存最终日报失败", { error: error.message });
      throw error;
    }
  }
}

module.exports = new FileStorage();
