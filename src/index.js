// src/index.js
const cron = require("node-cron");
const express = require("express");
const config = require("./config");
const dataCollector = require("./processors/dataCollector");
const firstLayerProcessor = require("./processors/firstLayer");
const secondLayerProcessor = require("./processors/secondLayer");
const logger = require("./utils/logger");

// 完整处理流程
async function runDigestProcess() {
  try {
    logger.info("开始每日Twitter摘要生成流程");

    // 步骤1: 收集并存储推文
    logger.info("步骤1: 收集Twitter推文");
    const tweets = await dataCollector.collectAndStoreTweets();

    if (tweets.length === 0) {
      logger.warn("没有推文可处理，流程终止");
      return;
    }

    // 步骤2: 第一层GPT分析
    logger.info("步骤2: 执行第一层GPT分析");
    const analysisResults = await firstLayerProcessor.processInChunks(tweets);

    // 步骤3: 第二层GPT生成最终日报
    logger.info("步骤3: 生成最终日报");
    const { digest, notionPageId } = await secondLayerProcessor.generateDigest(
      analysisResults
    );

    logger.info(`日报生成完成，已保存到Notion (页面ID: ${notionPageId})`);

    return {
      success: true,
      notionPageId,
    };
  } catch (error) {
    logger.error("日报生成流程失败", { error: error.message });
    throw error;
  }
}

// 设置定时任务
logger.info(`设置定时任务: ${config.cronSchedule}`);
cron.schedule(config.cronSchedule, async () => {
  logger.info("执行定时Twitter日报生成任务");
  try {
    await runDigestProcess();
  } catch (error) {
    logger.error("定时任务执行失败", { error: error.message });
  }
});

// 设置Express服务器
const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("Twitter日报生成器正在运行");
});

// 手动触发路由
app.get("/trigger", async (req, res) => {
  try {
    logger.info("收到手动触发请求");
    const result = await runDigestProcess();
    res.json({
      status: "success",
      message: "日报生成完成",
      notionPageId: result.notionPageId,
    });
  } catch (error) {
    logger.error("手动触发失败", { error: error.message });
    res.status(500).json({
      status: "error",
      message: "日报生成失败",
      error: error.message,
    });
  }
});

// 启动服务器
app.listen(PORT, () => {
  logger.info(`服务器运行在端口 ${PORT}`);
  logger.info("Twitter日报生成器初始化成功");
});
