// src/services/twitter.js
const axios = require("axios");
const config = require("../config");
const logger = require("../utils/logger");

class TwitterService {
  constructor() {
    this.apiUrl = config.twitter.apiUrl;
    this.apiKey = config.twitter.apiKey;
    this.listId = config.twitter.listId;
  }

  // 获取Twitter列表的最新推文
  async getListTweets(count = 10) {
    try {
      logger.info(`开始获取Twitter列表(${this.listId})的推文，请求${count}条`);

      // 构建查询参数
      const variables = {
        listId: this.listId,
        count: count,
        includePromotedContent: false,
      };

      // 发送请求
      const response = await axios({
        method: "get",
        url: this.apiUrl,
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

      // 处理数据
      const tweets = this.extractTweetsFromResponse(response.data.data);
      logger.info(`成功解析${tweets.length}条推文`);

      return tweets;
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

  // 从复杂JSON中提取推文数据
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
        logger.warn("缺少必要的数据结构");
        return tweets;
      }

      // 遍历instructions
      const instructions = apiData.list.tweets_timeline.timeline.instructions;
      for (const instruction of instructions) {
        if (!instruction.entries) continue;

        // 遍历entries
        for (const entry of instruction.entries) {
          if (
            !entry.content ||
            entry.content.__typename !== "TimelineTimelineModule"
          )
            continue;

          const items = entry.content.items || [];
          // 遍历module items
          for (const moduleItem of items) {
            if (!moduleItem.item || !moduleItem.item.itemContent) continue;

            const itemContent = moduleItem.item.itemContent;
            if (itemContent.__typename !== "TimelineTweet") continue;

            if (!itemContent.tweet_results || !itemContent.tweet_results.result)
              continue;

            const tweetResult = itemContent.tweet_results.result;
            const tweet = this.extractTweetData(tweetResult);

            if (tweet) {
              tweets.push(tweet);
            }
          }
        }
      }

      logger.info(`从复杂JSON中提取了${tweets.length}条推文`);
      return tweets;
    } catch (error) {
      logger.error("解析推文数据失败", { error: error.message });
      return tweets;
    }
  }

  // 提取单条推文数据
  extractTweetData(tweetResult) {
    try {
      // 基本推文数据
      const tweet = {
        id: tweetResult.rest_id || "",
        text: tweetResult.legacy?.full_text || "",
        createdAt: tweetResult.legacy?.created_at || "",
        authorName: "Unknown",
        authorUsername: "unknown",
        isQuote: tweetResult.legacy?.is_quote_status || false,
        metrics: {
          retweets: parseInt(tweetResult.legacy?.retweet_count || 0),
          likes: parseInt(tweetResult.legacy?.favorite_count || 0),
          replies: parseInt(tweetResult.legacy?.reply_count || 0),
        },
      };

      // 处理长文本推文
      if (
        tweetResult.note_tweet &&
        tweetResult.note_tweet.note_tweet_results &&
        tweetResult.note_tweet.note_tweet_results.result
      ) {
        const fullNoteText =
          tweetResult.note_tweet.note_tweet_results.result.text;
        if (fullNoteText) {
          tweet.fullNoteText = fullNoteText;
          tweet.text = fullNoteText;
        }
      }

      // 提取用户信息
      if (
        tweetResult.core &&
        tweetResult.core.user_results &&
        tweetResult.core.user_results.result
      ) {
        const userResult = tweetResult.core.user_results.result;
        tweet.authorName = userResult.legacy?.name || "Unknown";
        tweet.authorUsername = userResult.legacy?.screen_name || "unknown";
        tweet.authorId = userResult.rest_id || "";
        tweet.authorProfileImage =
          userResult.legacy?.profile_image_url_https || "";
      }

      // 处理引用推文
      if (
        tweet.isQuote &&
        tweetResult.quoted_status_result &&
        tweetResult.quoted_status_result.result
      ) {
        const quotedResult = tweetResult.quoted_status_result.result;

        const quotedTweet = {
          id: quotedResult.rest_id || "",
          text: quotedResult.legacy?.full_text || "",
          createdAt: quotedResult.legacy?.created_at || "",
          authorName: "Unknown",
          authorUsername: "unknown",
        };

        // 处理引用推文的长文本
        if (
          quotedResult.note_tweet &&
          quotedResult.note_tweet.note_tweet_results &&
          quotedResult.note_tweet.note_tweet_results.result
        ) {
          const fullNoteText =
            quotedResult.note_tweet.note_tweet_results.result.text;
          if (fullNoteText) {
            quotedTweet.fullNoteText = fullNoteText;
            quotedTweet.text = fullNoteText;
          }
        }

        // 提取引用推文作者信息
        if (
          quotedResult.core &&
          quotedResult.core.user_results &&
          quotedResult.core.user_results.result
        ) {
          const quotedUserResult = quotedResult.core.user_results.result;
          quotedTweet.authorName = quotedUserResult.legacy?.name || "Unknown";
          quotedTweet.authorUsername =
            quotedUserResult.legacy?.screen_name || "unknown";
          quotedTweet.authorId = quotedUserResult.rest_id || "";
        }

        tweet.quotedTweet = quotedTweet;
      }

      return tweet;
    } catch (error) {
      logger.warn(`解析单条推文时出错: ${error.message}`);
      return null;
    }
  }

  // 获取最近24小时的推文
  async getRecentTweets() {
    try {
      // 重试机制
      let retries = 3;
      let error;

      while (retries > 0) {
        try {
          const allTweets = await this.getListTweets(2);

          // 过滤最近24小时的推文
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);

          const recentTweets = allTweets.filter((tweet) => {
            if (!tweet.createdAt) return true;

            try {
              const tweetDate = new Date(tweet.createdAt);
              return !isNaN(tweetDate) && tweetDate >= yesterday;
            } catch (e) {
              return true; // 日期解析失败时保留推文
            }
          });

          logger.info(`筛选出${recentTweets.length}条最近24小时的推文`);
          return recentTweets;
        } catch (e) {
          error = e;
          retries--;
          if (retries > 0) {
            logger.warn(`获取推文失败，将重试，剩余重试次数: ${retries}`);
            await new Promise((resolve) => setTimeout(resolve, 2000)); // 等待2秒再重试
          }
        }
      }

      // 所有重试都失败
      throw error;
    } catch (error) {
      logger.error("获取最近推文失败", { error: error.message });
      throw error;
    }
  }
}

module.exports = new TwitterService();
