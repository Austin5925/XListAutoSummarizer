// src/services/twitter.js
const axios = require("axios");
const config = require("../config");
const logger = require("../utils/logger");

class TwitterService {
  constructor() {
    this.apiKey = config.twitter.apiKey;
    this.listId = config.twitter.listId;
    this.apiUrlTweet = config.twitter.apiUrlTweet;
    this.apiUrlList = config.twitter.apiUrlList;
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
  async getListTweets(count = 20) {
    try {
      logger.info(`开始获取Twitter列表最新的${count}条推文`);

      // 发送API请求
      const response = await this.makeApiRequest(count);

      console.log(response);

      if (!response || !response.data) {
        logger.error("Twitter API返回无效数据");
        return [];
      }

      // 处理数据
      const tweets = this.extractTweetsFromResponse(response.data.data);
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

    // 静态变量跟踪上次请求时间
    if (!this.constructor.lastRequestTime) {
      this.constructor.lastRequestTime = 0;
    }

    try {
      logger.debug(`获取推文详情 (ID: ${tweetId})`);

      // 实现速率限制：确保请求间隔至少为1秒
      const now = Date.now();
      const timeSinceLastRequest = now - this.constructor.lastRequestTime;

      if (timeSinceLastRequest < 1700) {
        // 需要等待的时间
        const delayNeeded = 1700 - timeSinceLastRequest;
        logger.debug(`速率限制: 等待 ${delayNeeded}ms 后再次请求`);

        // 等待所需时间
        await new Promise((resolve) => setTimeout(resolve, delayNeeded));
      }

      // 更新上次请求时间
      this.constructor.lastRequestTime = Date.now();

      // 构建URL
      const url = `${this.apiUrlTweet}?tweet_id=${tweetId}`;

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

      // 只提取需要的字段
      const threadTweets = response.data.tweets.map((tweet) => ({
        id: tweet.tweet_id,
        text: tweet.text,
        createdAt: tweet.created_at,
        userId: tweet.user_id,
        isReply: tweet.is_reply,
        // 只保留媒体URL
        mediaUrls: tweet.medias
          ? tweet.medias
              .map((m) => m.url || m.video_info?.variants?.[0]?.url)
              .filter(Boolean)
          : [],
      }));

      // 缓存结果
      this.threadCache.set(tweetId, {
        data: threadTweets,
        timestamp: Date.now(),
      });

      return threadTweets;
    } catch (error) {
      logger.error(`获取推文详情失败 (ID: ${tweetId}): ${error.message}`);
      return null;
    }
  }

  /**
   * 为推文获取和添加线程内容 - 优化版本
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
          const threadData = await this.getTweetDetailWithThread(tweet.id);
          if (threadData && threadData.length > 1) {
            // 过滤出属于同一用户的后续回复
            const userThreadParts = threadData.filter(
              (t) => t.id !== tweet.id && t.userId === tweet.user.id
            );

            if (userThreadParts.length > 0) {
              logger.info(
                `找到线程，包含 ${userThreadParts.length} 条后续推文`
              );

              // 将线程内容直接添加到第一层

              // 1. 添加线程文本数组，仅包含文本和ID
              tweet.threadTexts = userThreadParts.map((t) => ({
                id: t.id,
                text: t.text,
              }));

              // 2. 添加合并的完整文本
              const threadTextParts = [tweet.fullText];
              for (const part of userThreadParts) {
                threadTextParts.push(part.text);
              }
              tweet.fullThreadText = threadTextParts.join("\n\n");

              // 3. 收集所有媒体URL
              tweet.allMediaUrls = [...(tweet.media || []).map((m) => m.url)];
              for (const part of userThreadParts) {
                if (part.mediaUrls && part.mediaUrls.length > 0) {
                  for (const mediaUrl of part.mediaUrls) {
                    if (!tweet.allMediaUrls.includes(mediaUrl)) {
                      tweet.allMediaUrls.push(mediaUrl);
                    }
                  }
                }
              }

              // 4. 标记为已处理
              processedConversations.add(tweet.conversationId);
            }
          }
        } catch (error) {
          logger.error(`处理线程时出错: ${error.message}`);
        }
      }
    }

    return enrichedTweets;
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
        !apiData.list ||
        !apiData.list.tweets_timeline ||
        !apiData.list.tweets_timeline.timeline ||
        !apiData.list.tweets_timeline.timeline.instructions
      ) {
        logger.error("缺少必要的数据结构");
        return tweets;
      }

      // 遍历instructions
      const instructions = apiData.list.tweets_timeline.timeline.instructions;
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
      if (error.stack) logger.debug(error.stack);
    }

    return tweets;
  }

  /**
   * 提取单条推文数据
   * @param {Object} tweetData 推文原始数据
   * @returns {Object|null} 处理后的推文数据
   */
  extractTweetData(tweetData) {
    try {
      if (!tweetData || !tweetData.legacy) return null;

      const tweet = {
        id: tweetData.legacy.id_str,
        conversationId: tweetData.legacy.conversation_id_str,
        fullText: tweetData.legacy.full_text,
        createdAt: tweetData.legacy.created_at,
        favoriteCount: tweetData.legacy.favorite_count,
        replyCount: tweetData.legacy.reply_count,
        retweetCount: tweetData.legacy.retweet_count,
        quoteCount: tweetData.legacy.quote_count,
        isReply: !!tweetData.legacy.in_reply_to_status_id_str,
        inReplyToStatusId: tweetData.legacy.in_reply_to_status_id_str,
        inReplyToUserId: tweetData.legacy.in_reply_to_user_id_str,
        media: [],
        user: {
          id: tweetData.legacy.user_id_str,
          name: tweetData.core?.user_results?.result?.legacy?.name,
          screenName: tweetData.core?.user_results?.result?.legacy?.screen_name,
          profileImageUrl:
            tweetData.core?.user_results?.result?.legacy
              ?.profile_image_url_https,
          verified:
            tweetData.core?.user_results?.result?.legacy?.verified || false,
        },
      };

      // 添加视图计数
      if (tweetData.views && tweetData.views.count) {
        tweet.viewCount = tweetData.views.count;
      }

      // 提取外部链接
      if (tweetData.legacy.entities && tweetData.legacy.entities.urls) {
        tweet.externalUrls = tweetData.legacy.entities.urls.map(
          (url) => url.expanded_url
        );
      }

      // 提取媒体内容
      if (
        tweetData.legacy.extended_entities &&
        tweetData.legacy.extended_entities.media
      ) {
        for (const mediaItem of tweetData.legacy.extended_entities.media) {
          const media = {
            type: mediaItem.type,
            url: mediaItem.media_url_https,
          };

          // 处理视频
          if (media.type === "video" || media.type === "animated_gif") {
            // 找出最高质量的视频
            if (
              mediaItem.video_info?.variants &&
              mediaItem.video_info.variants.length > 0
            ) {
              let bestVideo = { bitrate: 0, url: "" };
              for (const variant of mediaItem.video_info.variants) {
                if (
                  variant.content_type === "video/mp4" &&
                  variant.bitrate &&
                  variant.bitrate > bestVideo.bitrate
                ) {
                  bestVideo = variant;
                }
              }
              media.videoUrl = bestVideo.url;
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

  /**
   * 发送API请求获取推文列表
   * @param {number} count 获取推文数量
   * @returns {Promise} API响应
   */
  async makeApiRequest(count) {
    try {
      // 构建查询参数
      const variables = {
        listId: config.twitter.listId,
        count: count,
        includePromotedContent: false,
      };

      logger.debug(`发送请求到: ${this.apiUrlList} 获取 ${count} 条推文`);

      // 发送请求
      const response = await axios({
        method: "get",
        url: this.apiUrlList,
        headers: {
          apikey: this.apiKey,
          "Content-Type": "application/json",
        },
        params: {
          variables: JSON.stringify(variables),
        },
        timeout: 30000, // 30秒超时
      });

      // 检查响应
      if (!response.data) {
        throw new Error("接收到空响应");
      }

      // 记录响应信息
      logger.info(
        `API响应状态: ${response.status}, 代码: ${
          response.data.code || "unknown"
        }`
      );

      if (response.data.code !== 200 && response.data.code !== undefined) {
        throw new Error(`API错误: ${response.data.msg || "未知错误"}`);
      }

      return response;
    } catch (error) {
      if (error.response) {
        logger.error("Twitter API响应错误", {
          status: error.response.status,
          data: error.response.data,
        });
      } else {
        logger.error(`请求失败: ${error.message}`);
      }
      throw error;
    }
  }
}

module.exports = new TwitterService();
