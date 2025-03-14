// test-twitter-parser.js
const fs = require("fs");
const path = require("path");
require("dotenv").config();

/**
 * 从API响应中提取所有推文
 * @param {Object} apiData API响应数据
 * @returns {Array} 提取的推文数组
 */
function extractTweetsFromResponse(apiData) {
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
      console.log("缺少必要的数据结构");
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
            const tweetResult = extractTweetData(
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
              const tweetResult = extractTweetData(
                itemContent.tweet_results?.result
              );
              if (tweetResult) tweets.push(tweetResult);
            }
          }
        }
      }
    }
  } catch (error) {
    console.error("解析推文数据时出错:", error);
  }

  return tweets;
}

/**
 * 提取单条推文数据
 * @param {Object} tweetResult 推文结果对象
 * @returns {Object|null} 提取的推文数据
 */
function extractTweetData(tweetResult) {
  try {
    if (!tweetResult || !tweetResult.legacy) {
      return null;
    }

    const tweetData = tweetResult.legacy;
    const user = tweetResult.core?.user_results?.result?.legacy || {};
    const userId = tweetResult.core?.user_results?.result?.rest_id || "";

    // 处理转发的推文
    let retweetedStatus = null;
    if (tweetData.retweeted_status_result) {
      retweetedStatus = extractTweetData(
        tweetData.retweeted_status_result.result
      );
    }

    // 处理引用的推文
    let quotedStatus = null;
    if (tweetData.quoted_status_result) {
      quotedStatus = extractTweetData(tweetData.quoted_status_result.result);
    }

    // 提取媒体数据
    const mediaItems = extractMediaItems(tweetData);

    // 提取外部链接
    const externalLinks = extractExternalLinks(tweetData.entities?.urls || []);

    return {
      id: tweetResult.rest_id || tweetData.id_str || "",
      text: tweetData.full_text || "",
      createdAt: tweetData.created_at || "",
      lang: tweetData.lang || "",
      conversationId: tweetData.conversation_id_str || "",

      // 用户信息
      user: {
        id: userId,
        name: user.name || "",
        screenName: user.screen_name || "",
        profileImageUrl: user.profile_image_url_https || "",
      },

      // 统计信息
      stats: {
        replyCount: tweetData.reply_count || 0,
        retweetCount: tweetData.retweet_count || 0,
        favoriteCount: tweetData.favorite_count || 0,
        quoteCount: tweetData.quote_count || 0,
        viewCount: tweetResult.views?.count || "0",
      },

      // 媒体和链接
      media: mediaItems,
      externalLinks: externalLinks,

      // 转发和引用
      isRetweet: !!tweetData.retweeted_status_result,
      retweetedStatus: retweetedStatus,
      isQuote: !!tweetData.is_quote_status,
      quotedStatus: quotedStatus,

      // 线程相关
      thread: [], // 将在后续处理中填充
      inReplyToStatusId: tweetData.in_reply_to_status_id_str || null,
      inReplyToUserId: tweetData.in_reply_to_user_id_str || null,
      inReplyToScreenName: tweetData.in_reply_to_screen_name || null,
    };
  } catch (error) {
    console.error("提取推文数据时出错:", error);
    return null;
  }
}

/**
 * 提取推文中的媒体内容
 * @param {Object} tweetData 推文数据
 * @returns {Array} 媒体项数组
 */
function extractMediaItems(tweetData) {
  const mediaItems = [];

  try {
    // 优先使用extended_entities，它包含更完整的媒体信息
    const mediaArray =
      tweetData.extended_entities?.media || tweetData.entities?.media || [];

    for (const media of mediaArray) {
      const mediaItem = {
        type: media.type,
        url: media.media_url_https || "",
        expandedUrl: media.expanded_url || "",
        displayUrl: media.display_url || "",
        width: media.original_info?.width || 0,
        height: media.original_info?.height || 0,
      };

      // 处理视频
      if (media.type === "video" || media.type === "animated_gif") {
        mediaItem.video = extractVideoInfo(media);
      }

      mediaItems.push(mediaItem);
    }
  } catch (error) {
    console.error("提取媒体数据时出错:", error);
  }

  return mediaItems;
}

/**
 * 提取视频信息
 * @param {Object} media 媒体对象
 * @returns {Object} 视频信息
 */
function extractVideoInfo(media) {
  try {
    if (!media.video_info) return null;

    const variants = media.video_info.variants || [];
    let bestVariant = null;
    let highestBitrate = 0;

    // 寻找最高质量的MP4变体
    variants.forEach((variant) => {
      if (
        variant.content_type === "video/mp4" &&
        variant.bitrate &&
        variant.bitrate > highestBitrate
      ) {
        highestBitrate = variant.bitrate;
        bestVariant = variant;
      }
    });

    return {
      aspectRatio: media.video_info.aspect_ratio || [16, 9],
      durationMs: media.video_info.duration_millis || 0,
      thumbnailUrl: media.media_url_https || "",
      variants: variants.map((v) => ({
        url: v.url,
        contentType: v.content_type,
        bitrate: v.bitrate || 0,
      })),
      bestQualityUrl: bestVariant ? bestVariant.url : null,
    };
  } catch (error) {
    console.error("提取视频信息时出错:", error);
    return null;
  }
}

/**
 * 提取外部链接
 * @param {Array} urls URL数组
 * @returns {Array} 处理后的链接数组
 */
function extractExternalLinks(urls) {
  try {
    return urls.map((url) => ({
      shortUrl: url.url || "",
      expandedUrl: url.expanded_url || "",
      displayUrl: url.display_url || "",
    }));
  } catch (error) {
    console.error("提取外部链接时出错:", error);
    return [];
  }
}

/**
 * 识别并构建线程关系
 * @param {Array} tweets 推文数组
 * @returns {Object} 处理结果
 */
function identifyThreads(tweets) {
  if (!tweets || tweets.length === 0) {
    return { tweets: [] };
  }

  try {
    console.log(`开始识别线程关系，共 ${tweets.length} 条推文...`);

    // 按照conversation_id分组
    const conversationMap = new Map();
    for (const tweet of tweets) {
      if (!tweet.conversationId) continue;

      if (!conversationMap.has(tweet.conversationId)) {
        conversationMap.set(tweet.conversationId, []);
      }

      conversationMap.get(tweet.conversationId).push(tweet);
    }

    console.log(`共识别出 ${conversationMap.size} 个会话`);

    // 遍历每个会话，构建线程关系
    let threadCount = 0;
    for (const [
      conversationId,
      conversationTweets,
    ] of conversationMap.entries()) {
      // 如果会话只有一条推文，跳过处理
      if (conversationTweets.length <= 1) continue;

      // 按时间排序（从早到晚）
      conversationTweets.sort(
        (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
      );

      // 找出会话的起始推文
      const rootTweet =
        conversationTweets.find((t) => !t.inReplyToStatusId) ||
        conversationTweets[0];

      // 识别用户自回复的线程（相同用户ID的推文）
      const userThreads = new Map();
      for (const tweet of conversationTweets) {
        const userId = tweet.user.id;
        if (!userThreads.has(userId)) {
          userThreads.set(userId, []);
        }
        userThreads.get(userId).push(tweet);
      }

      // 处理每个用户的线程
      for (const [userId, userTweets] of userThreads.entries()) {
        if (userTweets.length <= 1) continue;

        // 按照回复关系和时间排序构建线程
        const threadRoot =
          userTweets.find((t) => !t.inReplyToStatusId) || userTweets[0];
        const threadReplies = userTweets.filter((t) => t !== threadRoot);

        if (threadReplies.length > 0) {
          threadRoot.thread = threadReplies;
          threadCount++;
        }
      }
    }

    console.log(`共识别出 ${threadCount} 个线程`);

    return { tweets };
  } catch (error) {
    console.error("识别线程关系时出错:", error);
    return { tweets };
  }
}

/**
 * 打印推文信息
 * @param {Object} tweet 推文对象
 * @param {Number} index 索引
 */
function printTweetInfo(tweet, index) {
  try {
    console.log(`\n===== 推文 #${index + 1} =====`);
    console.log(`ID: ${tweet.id}`);
    console.log(`文本: ${tweet.text}`);
    console.log(`用户: ${tweet.user.name} (@${tweet.user.screenName})`);
    console.log(`创建时间: ${tweet.createdAt}`);
    console.log(`会话ID: ${tweet.conversationId}`);
    console.log(
      `统计: 回复${tweet.stats.replyCount}, 转发${tweet.stats.retweetCount}, 点赞${tweet.stats.favoriteCount}, 引用${tweet.stats.quoteCount}, 浏览${tweet.stats.viewCount}`
    );

    // 打印媒体信息
    if (tweet.media && tweet.media.length > 0) {
      console.log(`\n媒体内容 (${tweet.media.length}):`);
      for (let i = 0; i < tweet.media.length; i++) {
        const media = tweet.media[i];
        console.log(`  - 类型: ${media.type}`);
        console.log(`    URL: ${media.url}`);

        // 打印视频信息
        if (media.video) {
          console.log(`    视频信息:`);
          console.log(`      - 时长: ${media.video.durationMs / 1000}秒`);
          console.log(`      - 最佳质量: ${media.video.bestQualityUrl}`);
        }
      }
    }

    // 打印外部链接
    if (tweet.externalLinks && tweet.externalLinks.length > 0) {
      console.log(`\n外部链接 (${tweet.externalLinks.length}):`);
      for (let i = 0; i < tweet.externalLinks.length; i++) {
        const link = tweet.externalLinks[i];
        console.log(`  - ${link.expandedUrl}`);
      }
    }

    // 打印线程信息
    if (tweet.thread && tweet.thread.length > 0) {
      console.log(`\n线程内容 (${tweet.thread.length} 条后续推文):`);
      for (let i = 0; i < tweet.thread.length; i++) {
        const threadTweet = tweet.thread[i];
        console.log(
          `  [${i + 1}] ${threadTweet.text.substring(0, 100)}${
            threadTweet.text.length > 100 ? "..." : ""
          }`
        );
      }
    }

    // 打印转发或引用信息
    if (tweet.isRetweet && tweet.retweetedStatus) {
      console.log(
        `\n转发自: ${tweet.retweetedStatus.user.name} (@${tweet.retweetedStatus.user.screenName})`
      );
      console.log(
        `转发内容: ${tweet.retweetedStatus.text.substring(0, 100)}${
          tweet.retweetedStatus.text.length > 100 ? "..." : ""
        }`
      );
    } else if (tweet.isQuote && tweet.quotedStatus) {
      console.log(
        `\n引用自: ${tweet.quotedStatus.user.name} (@${tweet.quotedStatus.user.screenName})`
      );
      console.log(
        `引用内容: ${tweet.quotedStatus.text.substring(0, 100)}${
          tweet.quotedStatus.text.length > 100 ? "..." : ""
        }`
      );
    }
  } catch (error) {
    console.error("打印推文信息时出错:", error);
  }
}

/**
 * 打印API响应结构
 * @param {Object} data API响应数据
 */
function printApiStructure(data) {
  try {
    console.log("===== API响应结构 =====");
    console.log(`顶层结构: ${Object.keys(data).join(", ")}`);

    if (data.data && data.data.list) {
      console.log(`List属性: ${Object.keys(data.data.list).join(", ")}`);

      if (
        data.data.list.tweets_timeline &&
        data.data.list.tweets_timeline.timeline
      ) {
        console.log(
          `Timeline属性: ${Object.keys(
            data.data.list.tweets_timeline.timeline
          ).join(", ")}`
        );

        const instructions =
          data.data.list.tweets_timeline.timeline.instructions || [];
        console.log(`指令数量: ${instructions.length}`);

        let entriesCount = 0;
        let tweetsCount = 0;

        for (const instruction of instructions) {
          if (instruction.entries) {
            entriesCount += instruction.entries.length;

            for (const entry of instruction.entries) {
              // 计算推文数量
              if (entry.content) {
                if (
                  entry.content.__typename === "TimelineTimelineItem" &&
                  entry.content.itemContent &&
                  entry.content.itemContent.__typename === "TimelineTweet"
                ) {
                  tweetsCount++;
                } else if (
                  entry.content.__typename === "TimelineTimelineModule" &&
                  entry.content.items
                ) {
                  for (const item of entry.content.items) {
                    if (
                      item.item &&
                      item.item.itemContent &&
                      item.item.itemContent.__typename === "TimelineTweet"
                    ) {
                      tweetsCount++;
                    }
                  }
                }
              }
            }
          }
        }

        console.log(`总Entries数: ${entriesCount}`);
        console.log(`总推文数: ${tweetsCount}`);
      }
    }
  } catch (error) {
    console.error("分析API结构时出错:", error);
  }
}

/**
 * 主测试函数
 */
async function runTest() {
  try {
    console.log("===== Twitter API 数据解析测试 =====");

    // 读取测试数据
    let data;
    const rawDataPath = path.join(
      __dirname,
      "output",
      "raw-twitter-response.json"
    );

    if (fs.existsSync(rawDataPath)) {
      console.log("读取已保存的Twitter API响应数据...");
      try {
        data = JSON.parse(fs.readFileSync(rawDataPath, "utf8"));
      } catch (error) {
        console.error(`解析JSON文件失败: ${error.message}`);
        return;
      }
    } else {
      console.log("未找到API响应数据文件");
      return;
    }

    // 分析API结构
    printApiStructure(data);

    // 解析数据
    console.log("\n开始解析推文数据...");
    const tweets = extractTweetsFromResponse(data);

    // 分析并识别线程
    console.log("\n开始识别线程...");
    const { tweets: processedTweets } = identifyThreads(tweets);

    // 显示结果
    console.log(`\n成功解析 ${processedTweets.length} 条推文`);

    if (processedTweets.length > 0) {
      console.log("\n推文详细信息:");
      processedTweets.forEach((tweet, index) => {
        printTweetInfo(tweet, index);
      });

      // 保存解析结果
      const outputDir = path.join(__dirname, "output");
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const parsedPath = path.join(outputDir, "parsed-tweets.json");
      fs.writeFileSync(parsedPath, JSON.stringify(processedTweets, null, 2));
      console.log(`\n解析结果已保存到 ${parsedPath}`);

      // 统计线程数量
      const threadStarters = processedTweets.filter(
        (t) => t.thread && t.thread.length > 0
      );
      console.log(
        `\n找到 ${threadStarters.length} 个线程，总计包含 ${
          threadStarters.reduce((sum, t) => sum + (t.thread?.length || 0), 0) +
          threadStarters.length
        } 条推文`
      );
    } else {
      console.log("\n未解析到任何推文，请检查数据结构或解析逻辑");
    }
  } catch (error) {
    console.error("测试失败:", error);
  }
}

// 执行测试
runTest();
