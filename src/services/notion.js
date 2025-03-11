const { Client } = require("@notionhq/client");
const config = require("../config");
const logger = require("../utils/logger");
const fs = require("fs").promises;
const path = require("path");

class NotionService {
  constructor() {
    this.client = new Client({
      auth: config.notion.apiKey,
    });
    this.databaseId = config.notion.databaseId;
  }

  // 将日报保存到Notion
  async saveDigestToNotion(digest) {
    try {
      const today = new Date().toISOString().split("T")[0];

      // 1. 准备映射后的数据
      const mappedEntries = this.mapDigestToNotionEntries(digest, today);

      // 2. 将映射后的数据保存到本地
      const savedFilePath = await this.saveProcessedEntries(
        mappedEntries,
        today
      );
      logger.info(`已将处理后的条目数据保存到: ${savedFilePath}`);

      // 3. 将数据提交到Notion
      const responses = [];
      for (const entry of mappedEntries) {
        const response = await this.createNotionPage(entry);
        responses.push(response);
        // 添加短暂延迟以避免API限制
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      logger.info(`已成功保存 ${responses.length} 条主题到Notion`);
      return responses.map((r) => r.id);
    } catch (error) {
      logger.error("保存到Notion失败", { error: error.message });
      if (error.body) {
        logger.error("Notion API错误详情", { body: error.body });
      }
      throw error;
    }
  }

  // 将digest映射为Notion条目数组
  mapDigestToNotionEntries(digest, date) {
    const entries = [];

    // 如果没有主题，创建一个默认条目
    if (!digest.topics || digest.topics.length === 0) {
      entries.push({
        title: digest.title || `AI日报 - ${date}`,
        date: date,
        topic: "",
        stats: digest.stats || "",
      });
    } else {
      // 为每个主题创建单独的条目
      for (const topic of digest.topics) {
        entries.push({
          title: topic.title || "未命名主题",
          date: date,
          topic: topic.content || "",
          stats: digest.stats || "",
        });
      }
    }

    return entries;
  }

  // 保存处理后的条目数据到本地文件
  async saveProcessedEntries(entries, date) {
    try {
      const fileName = `${date}-notion-entries.json`;
      const filePath = path.join(config.paths.analysis, fileName);

      const data = {
        savedAt: new Date().toISOString(),
        entries: entries,
      };

      await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
      return filePath;
    } catch (error) {
      logger.error("保存处理后数据到本地文件失败", { error: error.message });
      throw error;
    }
  }

  // 确保文本不超过Notion的长度限制
  truncateText(text, maxLength = 2000) {
    if (!text) return "";
    if (typeof text !== "string") {
      text = String(text);
    }
    return text.length > maxLength
      ? text.substring(0, maxLength - 3) + "..."
      : text;
  }

  // 创建单个Notion页面
  async createNotionPage({ title, date, topic, stats }) {
    try {
      logger.info(`创建Notion页面，标题: "${title}"`);

      const response = await this.client.pages.create({
        parent: {
          database_id: this.databaseId,
        },
        properties: {
          title: {
            title: [
              {
                text: {
                  content: title || "未命名主题",
                },
              },
            ],
          },
          Date: {
            date: {
              start: date,
            },
          },
          stats: {
            rich_text: [
              {
                text: {
                  content: this.truncateText(
                    typeof stats === "string" ? stats : JSON.stringify(stats)
                  ),
                },
              },
            ],
          },
          topic: {
            rich_text: [
              {
                text: {
                  content: this.truncateText(topic || ""),
                },
              },
            ],
          },
        },
      });

      logger.info(`成功创建Notion页面: ${response.id}`);
      return response;
    } catch (error) {
      logger.error(`创建Notion页面失败: ${title}`, {
        error: error.message,
        details: error.body,
      });
      throw error;
    }
  }
}

module.exports = new NotionService();
