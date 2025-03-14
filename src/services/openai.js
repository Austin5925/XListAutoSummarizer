// src/services/openai.js
const axios = require("axios");
const config = require("../config");
const logger = require("../utils/logger");

class OpenAIService {
  constructor() {
    this.apiUrl = `${config.openai.apiUrl}/chat/completions`;
    this.apiKey = config.openai.apiKey;
    this.model = config.openai.model;
  }

  // 发送请求到OpenAI API
  async createChatCompletion(messages, options = {}) {
    try {
      const requestData = {
        model: this.model,
        messages: messages,
        temperature: options.temperature || 0.3,
        max_tokens: options.max_tokens,
        stream: false,
        ...options,
      };

      const response = await axios.post(this.apiUrl, requestData, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
      });

      return response.data;
    } catch (error) {
      const errorMsg = error.response?.data?.error?.message || error.message;
      logger.error(`OpenAI API请求失败: ${errorMsg}`);
      throw new Error(`OpenAI API请求失败: ${errorMsg}`);
    }
  }

  // 第一层分析：判断推文是否构成日报内容
  async analyzeChunk(tweets) {
    try {
      // 格式化推文 - 修改字段名以匹配TwitterService提供的数据结构
      const formattedTweets = tweets
        .map((tweet, index) => {
          // 使用正确的字段名
          const username = tweet.user?.screenName || "未知用户";
          const name = tweet.user?.name || "未知名称";
          const text = tweet.fullText || tweet.text || "无内容";

          return `[${index + 1}] @${username} (${name}): ${text}`;
        })
        .join("\n\n");

      // 添加额外调试信息
      logger.debug(`准备分析${tweets.length}条推文`);
      if (tweets.length > 0) {
        logger.debug(
          `第一条推文数据结构: ${JSON.stringify(Object.keys(tweets[0]))}`
        );
        if (tweets[0].user) {
          logger.debug(
            `第一条推文用户数据: ${JSON.stringify(Object.keys(tweets[0].user))}`
          );
        }
      }

      const prompt = `
      分析以下Twitter推文，判断哪些包含有新闻价值的信息适合放入日报：
      
      ${formattedTweets}
      
      请以JSON格式返回分析结果，格式如下：
      {
        "relevant_tweets": [
          {
            "index": 原推文序号,
            "summary": "推文内容摘要",
            "topic": "所属主题",
            "importance": 重要性评分(1-10)
          }
        ],
        "topics": ["主题1", "主题2"],
        "overall_assessment": "这批推文的总体评估"
      }

      筛选标准：
      1.必须与 AI 直接相关
        - 仅当 AI 是核心主题 时才入选，而非仅是附带提及。
        - 讨论泛泛行业趋势（如“AI 将改变世界”）不算新闻价值，需有 具体事件。
      2. 必须具备新闻价值
        - 是否提供了新的信息（如新产品发布、新研究、新政策）？
        - 是否影响广泛（如 OpenAI、DeepMind、斯坦福等权威机构发布的内容）？
        - 是否有具体细节（避免模糊表述，如“某公司在 AI 领域取得突破”）？
      3. 评估重要性（1-10 分）
        - 内容权重（是否重大事件？）
        - 作者权威性（是否来自知名机构、AI 研究员？）
        - 推文热度（点赞、转发、讨论量是否显著？）

      其他要求：
        - 仅返回 JSON，无相关推文时 relevant_tweets 为空数组。
        - summary 需信息具体，避免泛泛而谈。
      `;

      const messages = [
        {
          role: "system",
          content: "你是专业的新闻分析师，擅长从社交媒体中筛选有价值的信息。",
        },
        { role: "user", content: prompt },
      ];

      const response = await this.createChatCompletion(messages, {
        response_format: { type: "json_object" },
        temperature: 0.3,
        reasoning_effort: "low", // only for o3-mini
      });

      const result = JSON.parse(response.choices[0].message.content.trim());
      logger.info(
        `第一层分析完成，发现${result.relevant_tweets?.length || 0}条相关推文`
      );
      return result;
    } catch (error) {
      logger.error("第一层GPT分析失败", { error: error.message });
      throw error;
    }
  }

  // 第二层分析：生成日报
  async generateFinalDigest(analysisResults) {
    try {
      // 汇总所有相关推文和主题
      let allRelevantTweets = [];
      let allTopics = new Set();

      analysisResults.forEach((result) => {
        if (result.relevant_tweets) {
          allRelevantTweets = allRelevantTweets.concat(result.relevant_tweets);
        }

        if (result.topics) {
          result.topics.forEach((topic) => allTopics.add(topic));
        }
      });

      // 按主题分组
      const tweetsByTopic = {};
      allRelevantTweets.forEach((tweet) => {
        if (!tweetsByTopic[tweet.topic]) {
          tweetsByTopic[tweet.topic] = [];
        }
        tweetsByTopic[tweet.topic].push(tweet);
      });

      // 格式化主题信息
      const topicsInfo = Object.entries(tweetsByTopic)
        .map(([topic, tweets]) => {
          const tweetSummaries = tweets.map((t) => t.summary).join("\n- ");
          return `主题: ${topic}\n推文摘要:\n- ${tweetSummaries}`;
        })
        .join("\n\n");

      const prompt = `
      基于以下我关注列表的推特推文生成一份每日AI新闻日报：
      
      ${topicsInfo}
            
      日报要求：

      1、信息归纳：
        按 话题（topic） 归纳热点，每个话题应涉及一件具体的事情。
        如果多条推文讨论同一事件，应合并归纳为一条。
      2、内容筛选：
        仅收录与 AI 强相关 的内容，非 AI 相关推文请忽略。
        关注以下类别：
          新热点（如图灵奖得主公布，涉及强化学习）。
          新产品（如 GPT-4.5 发布）。
          重要产品更新（如 Grok AI 新增 impressive 的用例）。
          新的研究成果（如 DeepMind 发布新论文）。
          行业重大事件（如 OpenAI 宣布重大合作）。
      3、确保信息具体且有价值：
        避免模糊表述，确保每条信息提供足够的细节。
        避免无实质内容的泛泛归纳，例如：
        ❌ “讨论了 AI 编程领域的趋势” → 需要具体指出 “哪些趋势？”
        ❌ “一篇 AI 论文被 CVPR 接收” → 需要具体指出 “论文研究了什么问题？”
        如果一条推文没有提供足够的细节，不要收录。
      4、内容扩展要求：
        每条归纳应至少包含 2-3 句话，提供完整的背景信息和核心内容，而不是一句话概括。
        如果涉及产品更新或研究论文，需尽量提供 产品的关键特性 或 论文的核心研究方向。
      5、统计信息：
        统计当天处理的推文数据，并按照以下格式返回：
        "stats": "总推文：XX 条，最终日报：XX 条"

      返回格式（JSON）：
      {
        "topics": [
          {
            "title": "主题标题",
            "content": "主题详细内容（至少 2-3 句话，确保信息具体）"
          }
        ],
        "stats": "总推文：XX 条，最终日报：XX 条"
      }
      示例数据（仅用于参考）：
      "Google DeepMind 宣布推出 Gemma 3，这是一款高效能 AI 模型，能够在单个 GPU 或 TPU 上运行，大幅降低计算成本。这一突破可能使得更多企业和研究机构能够使用高性能 AI，而无需昂贵的计算资源。DeepMind 还表示，Gemma 3 未来将与 Google 生态进一步深度集成。"
      "OpenAI 宣布成立 NextGenAI 联盟，并计划投入 5000 万美元用于支持全球范围内的 AI 研究和教育项目。该联盟旨在资助学术机构、非盈利组织和教育项目，以推动 AI 技术在社会中的积极应用。OpenAI 还鼓励其他企业加入联盟，共享研究资源，促进 AI 领域的合作与发展。"
      `;

      /** 4o 的 prompt 例子
       * 
       *       我将给你展示一个例子。
      March 5 日报
      1️⃣ 斯坦福发布 STORM：可生成维基百科质量的学术报告
      斯坦福大学推出 STORM，一款专为学术研究设计的 AI 生成工具，能够自动撰写高质量的研究报告，目标是提升学术写作效率。STORM 依托斯坦福 Genie 实验室开发，结合最新的大模型技术，支持在多个学科领域生成接近维基百科质量的内容。研究者可以输入主题，STORM 将自动整合信息并撰写完整文档，为科研人员和学生提供强大的辅助工具。

      🔗 官网链接（配上超链接）
      2️⃣ 智谱 AI 发布并开源 CogView4-6B
      智谱 AI 推出 CogView4-6B，这是一个 6B 规模的视觉大模型，支持汉字输出，并选择开源，进一步推动 AI 视觉生成技术的发展。CogView4-6B 继承了 CogView 系列的能力，在图像理解和生成方面实现了突破，能够生成高质量的视觉内容，并支持多模态任务。开源的决定让开发者和研究者可以基于此模型进行优化和定制，促进 AI 视觉技术的创新和应用拓展。

      🔗 详情链接（配上超链接）
      3️⃣ OpenAI 成立 NextGenAI 联盟，投入 5000 万美元助力 AI 研究和教育
      OpenAI 宣布成立 NextGenAI 联盟，目标是资助全球的 AI 研究和教育机构，推动 AI 技术在社会中的积极应用。该联盟计划提供 5000 万美元资金，支持学术机构、非盈利组织和教育项目，旨在促进 AI 研究和培养下一代 AI 人才。此外，OpenAI 还鼓励其他企业和组织共同加入联盟，共享技术和研究资源，以加速 AI 在科研和教育领域的落地应用。

      🔗 官方公告（配上超链接）
      4️⃣ AI IDE Trae 集成 Deepseek R1，提升智能编程体验
      国内 AI IDE Trae 宣布与 Deepseek R1 集成，增强 AI 代码生成和编程辅助功能。Trae 是国内首个 AI 驱动的 IDE（集成开发环境），支持 AI 代码补全、调试等功能。这次与 Deepseek R1 的集成，将进一步优化代码生成质量，并提升开发效率，帮助程序员更高效地编写代码。

      🔗 详情链接（配上超链接）

      请注意，上面的日报有四条只是举例，你不需要完全按照这个数目来生成。有的时候，一整天的内容都只有一两条足够有价值成为日报，甚至极端情况没有也是可能的。有的时候热点数目较多，超过四条也是可能的，你要根据实际情况判断。

      我再给你看一些反面例子：

      "title": "Cursor Agent：代码生成中的挑战与解决方案",
      "content": "Cursor Agent引发了关于代码生成潜在问题的讨论，同时提出了针对这些问题的解决方案。该技术旨在优化生成式AI在软件开发中的应用，帮助开发者更高效地完成任务。这表明AI正在不断深入适配复杂的编程需求。"
      
      "title": "AI行业趋势：'Vibe Revenue'与未来预测",
      "content": "一篇关于"vibe revenue"的文章分析了AI公司未来的盈利模式及发展趋势。随着生成式AI与行业需求的深度融合，企业正在探索新的商业模式以应对竞争压力。"

      这两条都言之无物，既不是最新的动态，同时也泛泛而谈，言之无物。你要避免生成这种内容。
       */

      const messages = [
        {
          role: "system",
          content:
            "你是资深的日报编辑，擅长整合信息，生成简洁而有深度的日报内容。",
        },
        { role: "user", content: prompt },
      ];

      const response = await this.createChatCompletion(messages, {
        response_format: { type: "json_object" },
        temperature: 0.4,
        reasoning_effort: "low", // only for o3-mini
      });

      const result = JSON.parse(response.choices[0].message.content.trim());
      logger.info("最终日报生成完成");
      return result;
    } catch (error) {
      logger.error("生成最终日报失败", { error: error.message });
      throw error;
    }
  }
}

module.exports = new OpenAIService();
