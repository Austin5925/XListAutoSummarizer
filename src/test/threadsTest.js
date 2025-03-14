const axios = require("axios");

// 配置信息
const config = {
  apiKey: "bol65dbi1imo4jjptx0wmd7llv2zg3", // 使用你提供的示例API密钥
  baseUrl: "https://api.apidance.pro/graphql/TweetDetail",
};

// 递归获取线程中的所有推文
async function fetchEntireThread(tweetId, sessionId) {
  const allTweets = [];
  let currentTweetId = tweetId;

  // 首先获取当前推文
  const mainTweet = await fetchTweetDetail(tweetId);
  if (!mainTweet) {
    console.log("无法获取主推文，检查API密钥或推文ID");
    return [];
  }

  // 提取主推文信息
  const mainTweetData = extractTweetData(mainTweet);
  if (mainTweetData) {
    allTweets.push(mainTweetData);
  }

  // 尝试获取线程的前文(如果有的话)
  if (sessionId) {
    try {
      // 获取会话中的所有推文
      const sessionTweets = await fetchSessionTweets(sessionId);

      // 按时间顺序排列所有推文
      if (sessionTweets && sessionTweets.length > 0) {
        // 合并推文列表，过滤掉重复项
        const uniqueTweets = [...sessionTweets];

        // 确保不重复添加主推文
        if (mainTweetData && mainTweetData.id) {
          const mainTweetIndex = uniqueTweets.findIndex(
            (t) => t.id === mainTweetData.id
          );
          if (mainTweetIndex >= 0) {
            uniqueTweets.splice(mainTweetIndex, 1);
          }
        }

        // 合并结果
        allTweets.push(...uniqueTweets);
      }
    } catch (error) {
      console.error("获取会话推文时出错:", error.message);
    }
  }

  // 获取回复(如果有的话)
  try {
    const replies = await fetchReplies(tweetId);
    if (replies && replies.length > 0) {
      // 只添加同一作者的回复，这样可以获取线程的后续部分
      const authorReplies = replies.filter(
        (reply) => reply.user === mainTweetData.user
      );

      allTweets.push(...authorReplies);
    }
  } catch (error) {
    console.error("获取回复时出错:", error.message);
  }

  // 按创建时间排序
  allTweets.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  return allTweets;
}

// 获取单个推文的详情
async function fetchTweetDetail(tweetId) {
  try {
    console.log(`正在获取推文 ${tweetId} 的详情...`);

    const variables = {
      focalTweetId: tweetId,
      referrer: "profile",
      controller_data: "DAACDAABDAABCgABAAAAAAAAAAAKAAkAAAABFPY0+AAAAAA=",
      with_rux_injections: false,
      includePromotedContent: false,
      withCommunity: true,
      withQuickPromoteEligibilityTweetFields: true,
      withBirdwatchNotes: true,
      withVoice: true,
      withV2Timeline: true,
    };

    const response = await axios.get(config.baseUrl, {
      headers: {
        apikey: config.apiKey,
      },
      params: {
        variables: JSON.stringify(variables),
      },
    });

    return response.data;
  } catch (error) {
    console.error(`获取推文 ${tweetId} 详情时出错:`, error.message);
    if (error.response) {
      console.error("响应数据:", error.response.data);
    }
    return null;
  }
}

// 获取会话中的所有推文
async function fetchSessionTweets(sessionId) {
  try {
    console.log(`正在获取会话 ${sessionId} 的所有推文...`);

    const variables = {
      focalTweetId: sessionId,
      referrer: "profile",
      controller_data: "DAACDAABDAABCgABAAAAAAAAAAAKAAkAAAABFPY0+AAAAAA=",
      with_rux_injections: false,
      includePromotedContent: false,
      withCommunity: true,
      withQuickPromoteEligibilityTweetFields: true,
      withBirdwatchNotes: true,
      withVoice: true,
      withV2Timeline: true,
    };

    const response = await axios.get(config.baseUrl, {
      headers: {
        apikey: config.apiKey,
      },
      params: {
        variables: JSON.stringify(variables),
      },
    });

    return extractThreadTweets(response.data);
  } catch (error) {
    console.error(`获取会话 ${sessionId} 推文时出错:`, error.message);
    return [];
  }
}

// 获取推文的回复
async function fetchReplies(tweetId) {
  try {
    console.log(`正在获取推文 ${tweetId} 的回复...`);

    // 这里我们使用同一个API，但解析方式不同
    const variables = {
      focalTweetId: tweetId,
      referrer: "profile",
      controller_data: "DAACDAABDAABCgABAAAAAAAAAAAKAAkAAAABFPY0+AAAAAA=",
      with_rux_injections: false,
      includePromotedContent: false,
      withCommunity: true,
      withQuickPromoteEligibilityTweetFields: true,
      withBirdwatchNotes: true,
      withVoice: true,
      withV2Timeline: true,
    };

    const response = await axios.get(config.baseUrl, {
      headers: {
        apikey: config.apiKey,
      },
      params: {
        variables: JSON.stringify(variables),
      },
    });

    return extractReplies(response.data, tweetId);
  } catch (error) {
    console.error(`获取推文 ${tweetId} 回复时出错:`, error.message);
    return [];
  }
}

// 从API响应中提取单个推文的数据
function extractTweetData(data) {
  if (!data || !data.data) return null;

  try {
    // 查找主推文数据
    const tweetResult =
      data.data.threaded_conversation_with_injections_v2?.instructions?.[0]?.entries?.find(
        (e) => e.entryId?.includes("tweet-")
      )?.content?.itemContent?.tweet_results?.result;

    if (!tweetResult) return null;

    // 提取推文信息
    return {
      id: tweetResult.rest_id,
      text:
        tweetResult.legacy?.full_text ||
        tweetResult.note_tweet?.note_tweet_results?.result?.text ||
        "",
      createdAt: tweetResult.legacy?.created_at,
      user: tweetResult.core?.user_results?.result?.legacy?.screen_name,
      userName: tweetResult.core?.user_results?.result?.legacy?.name,
    };
  } catch (error) {
    console.error("提取推文数据时出错:", error.message);
    return null;
  }
}

// 从API响应中提取线程中的所有推文
function extractThreadTweets(data) {
  if (!data || !data.data) return [];

  try {
    const entries =
      data.data.threaded_conversation_with_injections_v2?.instructions?.[0]
        ?.entries;

    if (!entries || !Array.isArray(entries)) return [];

    const tweets = [];

    // 提取所有推文
    for (const entry of entries) {
      if (entry.content?.itemContent?.tweet_results?.result) {
        const tweet = entry.content.itemContent.tweet_results.result;

        tweets.push({
          id: tweet.rest_id,
          text:
            tweet.legacy?.full_text ||
            tweet.note_tweet?.note_tweet_results?.result?.text ||
            "",
          createdAt: tweet.legacy?.created_at,
          user: tweet.core?.user_results?.result?.legacy?.screen_name,
          userName: tweet.core?.user_results?.result?.legacy?.name,
        });
      }
    }

    return tweets;
  } catch (error) {
    console.error("提取线程推文时出错:", error.message);
    return [];
  }
}

// 从API响应中提取对特定推文的回复
function extractReplies(data, parentTweetId) {
  if (!data || !data.data) return [];

  try {
    const entries =
      data.data.threaded_conversation_with_injections_v2?.instructions?.[0]
        ?.entries;

    if (!entries || !Array.isArray(entries)) return [];

    const replies = [];

    // 查找回复
    for (const entry of entries) {
      // 跳过主推文
      if (entry.entryId && entry.entryId.includes(`tweet-${parentTweetId}`))
        continue;

      if (entry.content?.itemContent?.tweet_results?.result) {
        const tweet = entry.content.itemContent.tweet_results.result;

        // 确保这是一个回复
        if (
          tweet.legacy &&
          tweet.legacy.in_reply_to_status_id_str === parentTweetId
        ) {
          replies.push({
            id: tweet.rest_id,
            text:
              tweet.legacy?.full_text ||
              tweet.note_tweet?.note_tweet_results?.result?.text ||
              "",
            createdAt: tweet.legacy?.created_at,
            user: tweet.core?.user_results?.result?.legacy?.screen_name,
            userName: tweet.core?.user_results?.result?.legacy?.name,
          });
        }
      }
    }

    return replies;
  } catch (error) {
    console.error("提取回复时出错:", error.message);
    return [];
  }
}

// 合并推文线程文本
function combineThreadText(tweets) {
  if (!tweets || tweets.length === 0) return "未找到推文";

  return tweets
    .map((tweet, index) => {
      return `推文 #${index + 1} (ID: ${tweet.id}):\n@${tweet.user} (${
        tweet.userName
      }):\n${tweet.text}\n`;
    })
    .join("\n---\n\n");
}

// 主函数：获取并处理推文线程
async function getFullThread(tweetId, sessionId) {
  console.log(`正在获取推文 ${tweetId} 的完整线程...`);

  const threadTweets = await fetchEntireThread(tweetId, sessionId);

  if (threadTweets.length === 0) {
    console.log("未找到推文或线程信息");
    return null;
  }

  console.log(`找到 ${threadTweets.length} 条相关推文`);

  // 组合线程文本
  const combinedText = combineThreadText(threadTweets);

  console.log("\n===== 完整线程文本 =====\n");
  console.log(combinedText);

  return {
    threadTweets,
    combinedText,
  };
}

// 测试函数
async function runTest() {
  // 使用你提供的推文ID和会话ID
  const tweetId = "1899373732055101880";
  const sessionId = "1899373710382899693";

  try {
    // 获取完整线程
    const result = await getFullThread(tweetId, sessionId);

    if (result) {
      console.log(`线程共有 ${result.threadTweets.length} 条推文`);

      // 将结果保存到文件
      const fs = require("fs");
      fs.writeFileSync("thread.txt", result.combinedText);
      console.log("线程已保存到 thread.txt 文件");

      // 也保存JSON格式以便进一步处理
      fs.writeFileSync(
        "thread.json",
        JSON.stringify(result.threadTweets, null, 2)
      );
      console.log("线程数据已保存到 thread.json 文件");
    }
  } catch (error) {
    console.error("运行测试时出错:", error);
  }
}

// 运行测试
runTest();
