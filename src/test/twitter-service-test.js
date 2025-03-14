// twitter-service-test.js
const fs = require("fs");
const path = require("path");
const axios = require("axios");
require("dotenv").config();

// 简单的日志替代实现
const logger = {
  info: console.log,
  error: console.error,
  warn: console.warn,
  debug: console.log,
};

/**
 * Twitter 服务的测试实现
 */
class TwitterServiceTester {
  constructor() {
    // 从环境变量获取API密钥
    this.apiKey = process.env.TWITTER_API_KEY || "";
    this.tweetDetailApiUrl = "https://api.apidance.pro/sapi/TweetDetail";
    // 缓存已获取过的线程，避免重复请求
    this.threadCache = new Map();
    // 缓存过期时间（毫秒）
    this.cacheExpiry = 30 * 60 * 1000; // 30分钟
  }

  /**
   * 获取Twitter列表的最新推文
   * @param {number} count 获取推文数量
   * @returns {Promise<Array>} 推文数组
   */
  async getListTweets(count = 10) {
    try {
      logger.info(`开始获取Twitter列表最新的${count}条推文`);

      // 读取本地JSON文件作为测试数据
      const data = await this.loadLocalTestData();
      if (!data) {
        logger.error("无法加载测试数据");
        return [];
      }

      // 处理数据
      const tweets = this.extractTweetsFromResponse(data);
      logger.info(`成功解析${tweets.length}条基础推文`);

      // 为具有线程的推文获取完整内容
      const tweetsWithThreads = await this.enrichTweetsWithThreads(tweets);

      logger.info(`成功解析${tweetsWithThreads.length}条推文（包含线程）`);
      return tweetsWithThreads;
    } catch (error) {
      logger.error(`获取Twitter列表推文失败: ${error.message}`);
      return [];
    }
  }

  /**
   * 加载本地测试数据
   */
  async loadLocalTestData() {
    try {
      const rawDataPath = path.join(
        __dirname,
        "output",
        "raw-twitter-response.json"
      );
      if (fs.existsSync(rawDataPath)) {
        return JSON.parse(fs.readFileSync(rawDataPath, "utf8"));
      }
      logger.error("测试数据文件不存在");
      return null;
    } catch (error) {
      logger.error(`加载测试数据失败: ${error.message}`);
      return null;
    }
  }

  /**
   * 为推文获取和添加线程内容
   * @param {Array} tweets 推文数组
   * @returns {Promise<Array>} 带有线程的推文数组
   */
  async enrichTweetsWithThreads(tweets) {
    const enrichedTweets = [...tweets];
    // 跟踪已处理的会话ID，避免重复处理
    const processedConversations = new Set();

    for (let i = 0; i < enrichedTweets.length; i++) {
      const tweet = enrichedTweets[i];

      // 跳过已处理过的会话
      if (processedConversations.has(tweet.conversationId)) {
        continue;
      }

      // 检查是否是用户自己发起的原始推文（可能是线程的第一条）
      if (!tweet.inReplyToStatusId && tweet.user.screenName) {
        try {
          logger.info(`检查推文是否有线程: ${tweet.id}`);

          // 获取线程推文
          const threadTweets = await this.getTweetDetailWithThread(tweet.id);
          if (threadTweets && threadTweets.length > 1) {
            // 过滤出属于同一用户的后续回复
            const userThreadTweets = threadTweets.filter(
              (t) =>
                t.id !== tweet.id &&
                t.user.id === tweet.user.id &&
                (t.inReplyToStatusId === tweet.id || t.isReplyToThread)
            );

            if (userThreadTweets.length > 0) {
              logger.info(
                `找到线程，包含 ${userThreadTweets.length} 条后续推文`
              );

              // 添加线程到推文
              tweet.thread = userThreadTweets;

              // 创建合并后的文本
              tweet.mergedText = this.createMergedThreadText(
                tweet,
                userThreadTweets
              );

              // 收集所有媒体
              tweet.allMedia = [...(tweet.media || [])];
              for (const threadTweet of userThreadTweets) {
                if (threadTweet.media && threadTweet.media.length > 0) {
                  tweet.allMedia.push(...threadTweet.media);
                }
              }

              // 收集所有URL
              tweet.allUrls = [...(tweet.urls || [])];
              for (const threadTweet of userThreadTweets) {
                if (threadTweet.urls && threadTweet.urls.length > 0) {
                  tweet.allUrls.push(...threadTweet.urls);
                }
              }
            }
          }

          // 标记此会话已处理
          processedConversations.add(tweet.conversationId);
        } catch (error) {
          logger.warn(`获取推文 ${tweet.id} 的线程失败: ${error.message}`);
        }
      }
    }

    return enrichedTweets;
  }

  /**
   * 创建合并的线程文本
   */
  createMergedThreadText(mainTweet, threadTweets) {
    let mergedText = mainTweet.fullText || "";

    // 按时间或回复顺序排序
    threadTweets.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    // 添加每条线程推文的文本
    for (const tTweet of threadTweets) {
      mergedText += "\n\n" + (tTweet.fullText || "");
    }

    return mergedText;
  }

  /**
   * 从TweetDetail API获取完整线程
   * @param {string} tweetId 推文ID
   * @returns {Promise<Array|null>} 线程推文数组
   */
  async getTweetDetailWithThread(tweetId) {
    // 检查缓存
    if (this.threadCache.has(tweetId)) {
      const cachedData = this.threadCache.get(tweetId);
      // 检查缓存是否过期
      if (Date.now() - cachedData.timestamp < this.cacheExpiry) {
        logger.debug(`使用缓存的线程数据 (ID: ${tweetId})`);
        return cachedData.data;
      }
    }

    try {
      logger.debug(`获取推文详情 (ID: ${tweetId})`);

      // 如果没有API密钥，尝试使用示例数据
      if (!this.apiKey) {
        logger.warn("没有API密钥，尝试使用本地示例数据");
        return await this.loadSampleThreadData(tweetId);
      }

      // 构建URL
      const url = `${this.tweetDetailApiUrl}?tweet_id=${tweetId}`;

      // 发送请求
      const response = await axios.get(url, {
        headers: {
          apikey: this.apiKey,
        },
      });

      if (
        !response.data ||
        !response.data.tweets ||
        !Array.isArray(response.data.tweets)
      ) {
        logger.warn(`TweetDetail API返回无效数据 (ID: ${tweetId})`);
        return null;
      }

      // 处理返回的线程数据
      const threadTweets = response.data.tweets.map((tweet) =>
        this.convertDetailApiTweet(tweet)
      );

      // 缓存结果
      this.threadCache.set(tweetId, {
        data: threadTweets,
        timestamp: Date.now(),
      });

      logger.debug(`成功获取线程，包含 ${threadTweets.length} 条推文`);

      // 可选：保存响应数据到文件以便调试
      this.saveTweetDetailResponse(tweetId, response.data);

      return threadTweets;
    } catch (error) {
      logger.error(`获取推文详情失败 (ID: ${tweetId}): ${error.message}`);
      return null;
    }
  }

  /**
   * 加载示例线程数据（当没有API密钥时使用）
   */
  async loadSampleThreadData(tweetId) {
    try {
      // 检查是否有针对特定ID的示例数据
      const samplePath = path.join(
        __dirname,
        "samples",
        `thread-${tweetId}.json`
      );
      if (fs.existsSync(samplePath)) {
        const data = JSON.parse(fs.readFileSync(samplePath, "utf8"));
        return data.tweets.map((tweet) => this.convertDetailApiTweet(tweet));
      }

      // 尝试读取通用示例数据
      const genericSamplePath = path.join(
        __dirname,
        "samples",
        "sample-thread.json"
      );
      if (fs.existsSync(genericSamplePath)) {
        const data = JSON.parse(fs.readFileSync(genericSamplePath, "utf8"));
        return data.tweets.map((tweet) => this.convertDetailApiTweet(tweet));
      }

      // 使用硬编码的示例数据
      return this.getHardcodedSampleThread(tweetId);
    } catch (error) {
      logger.error(`加载示例线程数据失败: ${error.message}`);
      return null;
    }
  }

  /**
   * 硬编码的示例线程数据
   */
  getHardcodedSampleThread(tweetId) {
    // 创建一个示例线程
    return [
      {
        id: tweetId,
        user: {
          id: "1551258526584115204",
          name: "AI Will",
          screenName: "FinanceYF5",
          profileImageUrl: "https://example.com/profile.jpg",
        },
        fullText:
          "Manus AI 发布才刚过 5 天，一个强大的代理 AI。\n\n而且大家开始用它进行疯狂的创意尝试。\n\n10 个疯狂的例子：\n\n1. 特斯拉 FSD 驾驶，同时 Manus AI 为你的咖啡会议准备要点 🤯",
        createdAt: "Tue Mar 11 08:15:55 +0000 2025",
        conversationId: tweetId,
        media: [
          {
            type: "video",
            url: "https://pbs.twimg.com/ext_tw_video_thumb/1899373247151378432/pu/img/ZGDZyb5OytufK6jS.jpg",
            bestVideoUrl:
              "https://video.twimg.com/ext_tw_video/1899373247151378432/pu/vid/avc1/1270x720/dMV5qm-HtUZ3bKSM.mp4?tag=12",
          },
        ],
        urls: [],
        metrics: {
          retweets: 14,
          likes: 38,
          replies: 2,
          quotes: 1,
          views: "6898",
        },
        isRetweet: false,
        isQuote: false,
      },
      {
        id: "1899373712857870344",
        user: {
          id: "1551258526584115204",
          name: "AI Will",
          screenName: "FinanceYF5",
          profileImageUrl: "https://example.com/profile.jpg",
        },
        fullText: "2. 用 ThreeJS 做的 Crossy Road 克隆",
        createdAt: "Tue Mar 11 08:15:56 +0000 2025",
        conversationId: tweetId,
        inReplyToStatusId: tweetId,
        inReplyToUserId: "1551258526584115204",
        isReplyToThread: true,
        urls: [
          {
            url: "https://t.co/MOVa798CgN",
            expandedUrl: "https://twitter.com/u2f49/status/1899079262734561502",
          },
        ],
        metrics: { retweets: 0, likes: 0, replies: 1, quotes: 0, views: "0" },
      },
      {
        id: "1899373852364558450",
        user: {
          id: "1551258526584115204",
          name: "AI Will",
          screenName: "FinanceYF5",
          profileImageUrl: "https://example.com/profile.jpg",
        },
        fullText:
          "以上就是全部，原作者 @minchoi\n\n如果您喜欢这个主题：\n\n1.关注我（@FinanceYF5）\n2. 点赞+转发下面第一条帖子",
        createdAt: "Tue Mar 11 08:16:29 +0000 2025",
        conversationId: tweetId,
        inReplyToStatusId: "1899373732055101880",
        inReplyToUserId: "1551258526584115204",
        isReplyToThread: true,
        urls: [
          {
            url: "https://t.co/ZOK6Db43Rk",
            expandedUrl:
              "https://twitter.com/FinanceYF5/status/1899373710382899693",
          },
        ],
        metrics: { retweets: 0, likes: 0, replies: 0, quotes: 0, views: "0" },
      },
    ];
  }

  /**
   * 保存TweetDetail API响应到文件（调试用）
   */
  saveTweetDetailResponse(tweetId, responseData) {
    try {
      const outputDir = path.join(__dirname, "output");
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const filePath = path.join(outputDir, `tweet-detail-${tweetId}.json`);
      fs.writeFileSync(filePath, JSON.stringify(responseData, null, 2));
      logger.debug(`已保存TweetDetail响应到: ${filePath}`);
    } catch (error) {
      logger.warn(`保存TweetDetail响应失败: ${error.message}`);
    }
  }

  /**
   * 转换TweetDetail API返回的推文格式
   */
  convertDetailApiTweet(apiTweet) {
    // 提取媒体内容
    const media = [];
    if (apiTweet.medias && Array.isArray(apiTweet.medias)) {
      apiTweet.medias.forEach((m) => {
        const mediaItem = {
          type: m.type || apiTweet.media_type,
          url: m.media_url || m.url || "",
          width: m.width,
          height: m.height,
        };

        // 添加视频信息（如果有）
        if (mediaItem.type === "video" && m.video_info) {
          mediaItem.videoInfo = {
            variants: m.video_info.variants || [],
          };

          // 找出最高质量的视频
          if (
            mediaItem.videoInfo.variants &&
            mediaItem.videoInfo.variants.length > 0
          ) {
            let bestVideo = { bitrate: 0, url: "" };
            for (const variant of mediaItem.videoInfo.variants) {
              if (
                variant.content_type === "video/mp4" &&
                variant.bitrate &&
                variant.bitrate > bestVideo.bitrate
              ) {
                bestVideo = variant;
              }
            }
            mediaItem.bestVideoUrl = bestVideo.url;
          }
        }

        media.push(mediaItem);
      });
    }

    // 返回标准化的推文对象
    return {
      id: apiTweet.tweet_id,
      conversationId: apiTweet.conversation_id || apiTweet.tweet_id, // 如果没有会话ID，使用推文ID
      inReplyToStatusId: apiTweet.is_reply ? apiTweet.related_tweet_id : null,
      inReplyToUserId: apiTweet.is_reply ? apiTweet.related_user_id : null,
      user: {
        id: apiTweet.user_id,
        name: apiTweet.user?.name || "",
        screenName: apiTweet.user?.screen_name || "",
        profileImageUrl: apiTweet.user?.profile_image_url || "",
      },
      fullText: apiTweet.text,
      createdAt: apiTweet.created_at,
      isRetweet: apiTweet.is_retweet,
      isQuote: apiTweet.is_quote,
      isReply: apiTweet.is_reply,
      isReplyToThread:
        apiTweet.is_reply && apiTweet.related_user_id === apiTweet.user_id, // 自己回复自己的推文
      urls: [],
      media: media,
      metrics: {
        retweets: parseInt(apiTweet.retweet_count, 10) || 0,
        likes: parseInt(apiTweet.favorite_count, 10) || 0,
        replies: parseInt(apiTweet.reply_count, 10) || 0,
        quotes: parseInt(apiTweet.quote_count, 10) || 0,
        views: "0", // TweetDetail API 可能不提供浏览数
      },
    };
  }

  /**
   * 从API响应中提取所有推文
   * @param {Object} apiData API响应数据
   * @returns {Array} 提取的推文数组
   */
  extractTweetsFromResponse(apiData) {
    const tweets = [];

    try {
      // 确保必要的数据存在
      if (
        !apiData ||
        !apiData.data ||
        !apiData.data.list ||
        !apiData.data.list.tweets_timeline ||
        !apiData.data.list.tweets_timeline.timeline ||
        !apiData.data.list.tweets_timeline.timeline.instructions
      ) {
        logger.error("缺少必要的数据结构");
        return tweets;
      }

      // 遍历instructions
      const instructions =
        apiData.data.list.tweets_timeline.timeline.instructions;
      for (const instruction of instructions) {
        if (!instruction.entries) continue;

        // 遍历entries
        for (const entry of instruction.entries) {
          if (!entry.content) continue;

          // 处理TimelineTimelineItem类型的内容
          if (entry.content.__typename === "TimelineTimelineItem") {
            const itemContent = entry.content.itemContent;
            if (itemContent && itemContent.__typename === "TimelineTweet") {
              const tweetResult = this.extractTweetData(
                itemContent.tweet_results?.result
              );
              if (tweetResult) tweets.push(tweetResult);
            }
          }

          // 处理TimelineTimelineModule类型的内容（处理多条推文的模块）
          else if (entry.content.__typename === "TimelineTimelineModule") {
            if (!entry.content.items) continue;

            for (const item of entry.content.items) {
              const itemContent = item.item?.itemContent;
              if (itemContent && itemContent.__typename === "TimelineTweet") {
                const tweetResult = this.extractTweetData(
                  itemContent.tweet_results?.result
                );
                if (tweetResult) tweets.push(tweetResult);
              }
            }
          }
        }
      }
    } catch (error) {
      logger.error(`解析推文数据时出错: ${error.message}`);
    }

    return tweets;
  }

  /**
   * 提取单条推文数据
   * @param {Object} tweetResult 推文结果对象
   * @returns {Object|null} 提取的推文数据
   */
  extractTweetData(tweetResult) {
    try {
      if (!tweetResult || !tweetResult.legacy) {
        return null;
      }

      const tweetData = tweetResult.legacy;
      const userData = tweetResult.core?.user_results?.result?.legacy || {};

      // 基本推文信息
      const tweet = {
        id: tweetResult.rest_id || tweetData.id_str || "",
        conversationId: tweetData.conversation_id_str || tweetData.id_str || "",
        inReplyToStatusId: tweetData.in_reply_to_status_id_str || null,
        inReplyToUserId: tweetData.in_reply_to_user_id_str || null,
        inReplyToScreenName: tweetData.in_reply_to_screen_name || null,
        user: {
          id: userData.id_str || tweetData.user_id_str || "",
          name: userData.name || "",
          screenName: userData.screen_name || "",
          profileImageUrl: userData.profile_image_url_https || "",
        },
        fullText: tweetData.full_text || "",
        displayText: tweetData.full_text || "", // 可能需要对文本进行处理以显示
        createdAt: tweetData.created_at || "",
        isRetweet: !!tweetData.retweeted_status_result,
        isQuote:
          !!tweetData.is_quote_status && !!tweetData.quoted_status_result,
        isReply: !!tweetData.in_reply_to_status_id_str,
        language: tweetData.lang || "",
        metrics: {
          retweets: parseInt(tweetData.retweet_count, 10) || 0,
          likes: parseInt(tweetData.favorite_count, 10) || 0,
          replies: parseInt(tweetData.reply_count, 10) || 0,
          quotes: parseInt(tweetData.quote_count, 10) || 0,
          views: tweetResult.views?.count || "0",
        },
        urls: [],
        media: [],
      };

      // 提取URL
      if (tweetData.entities && tweetData.entities.urls) {
        tweet.urls = tweetData.entities.urls.map((url) => ({
          url: url.url,
          expandedUrl: url.expanded_url,
          displayUrl: url.display_url,
        }));
      }

      // 提取媒体内容
      if (tweetData.extended_entities && tweetData.extended_entities.media) {
        for (const mediaItem of tweetData.extended_entities.media) {
          const media = {
            type: mediaItem.type,
            url: mediaItem.media_url_https,
            expandedUrl: mediaItem.expanded_url,
            width: mediaItem.original_info?.width,
            height: mediaItem.original_info?.height,
          };

          // 处理视频
          if (media.type === "video" || media.type === "animated_gif") {
            media.videoInfo = {
              aspectRatio: mediaItem.video_info?.aspect_ratio,
              durationMs: mediaItem.video_info?.duration_millis,
              variants: mediaItem.video_info?.variants || [],
            };

            // 找出最高质量的视频
            if (
              media.videoInfo.variants &&
              media.videoInfo.variants.length > 0
            ) {
              let bestVideo = { bitrate: 0, url: "" };
              for (const variant of media.videoInfo.variants) {
                if (
                  variant.content_type === "video/mp4" &&
                  variant.bitrate &&
                  variant.bitrate > bestVideo.bitrate
                ) {
                  bestVideo = variant;
                }
              }
              media.bestVideoUrl = bestVideo.url;
            }
          }

          tweet.media.push(media);
        }
      }

      return tweet;
    } catch (error) {
      logger.error(`提取推文数据失败: ${error.message}`);
      return null;
    }
  }
}

/**
 * 打印推文线程信息
 */
function printThreadInfo(tweet) {
  console.log(`\n===== 推文线程信息 =====`);
  console.log(`ID: ${tweet.id}`);
  console.log(`作者: ${tweet.user.name} (@${tweet.user.screenName})`);
  console.log(`时间: ${tweet.createdAt}`);
  console.log(
    `内容: ${tweet.fullText.substring(0, 100)}${
      tweet.fullText.length > 100 ? "..." : ""
    }`
  );

  if (tweet.media && tweet.media.length > 0) {
    console.log(`\n媒体数量: ${tweet.media.length}`);
    tweet.media.forEach((m, i) => {
      console.log(`  媒体 ${i + 1}: 类型=${m.type}, URL=${m.url}`);
      if (m.bestVideoUrl) {
        console.log(`    最佳视频: ${m.bestVideoUrl}`);
      }
    });
  }

  if (tweet.thread && tweet.thread.length > 0) {
    console.log(`\n线程: 该推文有 ${tweet.thread.length} 条后续回复`);
    tweet.thread.forEach((t, i) => {
      console.log(
        `  回复 ${i + 1}: ${t.fullText.substring(0, 100)}${
          t.fullText.length > 100 ? "..." : ""
        }`
      );
    });

    if (tweet.mergedText) {
      console.log(`\n合并后的文本:`);
      console.log(
        `${tweet.mergedText.substring(0, 200)}${
          tweet.mergedText.length > 200 ? "..." : ""
        }`
      );
    }

    if (tweet.allMedia && tweet.allMedia.length > 0) {
      console.log(`\n所有媒体: ${tweet.allMedia.length} 项`);
    }

    if (tweet.allUrls && tweet.allUrls.length > 0) {
      console.log(`\n所有URL: ${tweet.allUrls.length} 项`);
      tweet.allUrls.forEach((u, i) => {
        console.log(`  URL ${i + 1}: ${u.expandedUrl || u.url}`);
      });
    }
  }
}

/**
 * 主测试函数
 */
async function runTwitterServiceTest() {
  console.log("===== Twitter服务测试 =====");

  // 创建服务实例
  const twitterService = new TwitterServiceTester();

  // 测试获取列表推文
  console.log("\n1. 测试获取列表推文");
  const listTweets = await twitterService.getListTweets();
  console.log(`获取到 ${listTweets.length} 条推文`);

  // 查找包含线程的推文
  const threadsFound = listTweets.filter(
    (t) => t.thread && t.thread.length > 0
  );
  console.log(`其中 ${threadsFound.length} 条推文包含线程`);

  // 显示线程信息
  if (threadsFound.length > 0) {
    // 打印每个线程的详细信息
    threadsFound.forEach((tweet, index) => {
      console.log(`\n--- 线程 ${index + 1} ---`);
      printThreadInfo(tweet);
    });

    // 保存结果
    const outputDir = path.join(__dirname, "output");
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(
      path.join(outputDir, "thread-tweets.json"),
      JSON.stringify(threadsFound, null, 2)
    );
    console.log(
      `\n线程推文已保存到 ${path.join(outputDir, "thread-tweets.json")}`
    );
  }

  // 测试获取单条推文详情
  if (process.env.TWITTER_API_KEY) {
    console.log("\n2. 测试获取单条推文详情");
    const tweetId = "1899373710382899693"; // 示例推文ID
    const tweetDetail = await twitterService.getTweetDetailWithThread(tweetId);

    if (tweetDetail) {
      console.log(`获取到推文详情，包含 ${tweetDetail.length} 条相关推文`);

      // 保存详情结果
      fs.writeFileSync(
        path.join(outputDir, "single-tweet-detail.json"),
        JSON.stringify(tweetDetail, null, 2)
      );
      console.log(
        `单条推文详情已保存到 ${path.join(
          outputDir,
          "single-tweet-detail.json"
        )}`
      );
    } else {
      console.log("未能获取推文详情");
    }
  } else {
    console.log("\n2. 跳过获取单条推文详情测试（未设置API密钥）");
  }

  console.log("\n测试完成");
}

// 执行测试
runTwitterServiceTest().catch((error) => {
  console.error("测试失败:", error);
});
