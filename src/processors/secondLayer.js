// src/processors/secondLayer.js
const openaiService = require("../services/openai");
const fileStorage = require("../storage/fileStorage");
const notionService = require("../services/notion");
const logger = require("../utils/logger");

class SecondLayerProcessor {
  // 生成最终日报
  async generateDigest(analysisResults) {
    try {
      logger.info("开始生成最终日报");

      // 使用OpenAI生成日报
      const digest = await openaiService.generateFinalDigest(analysisResults);

      // 保存到本地
      await fileStorage.saveFinalDigest(digest);

      // 保存到Notion
      const notionPageId = await notionService.saveDigestToNotion(digest);

      return {
        digest,
        notionPageId,
      };
    } catch (error) {
      logger.error("生成最终日报失败", { error: error.message });
      throw error;
    }
  }
}

module.exports = new SecondLayerProcessor();
