// test-twitter-parser.js
require("dotenv").config();
const fs = require("fs");

// 模拟推文数据
const sampleData = {
  // 这里粘贴您提供的完整JSON数据
};

// 提取函数
function extractTweetsFromResponse(apiData) {
  // 提取逻辑与上面相同
}

function extractTweetData(tweetResult) {
  // 提取逻辑与上面相同
}

// 运行测试
function testParser() {
  try {
    console.log("===== Twitter API 解析测试 =====");

    // 解析数据
    console.log("开始解析示例数据...");
    const tweets = extractTweetsFromResponse(sampleData.data);

    console.log(`\n成功解析 ${tweets.length} 条推文`);

    if (tweets.length > 0) {
      console.log("\n前3条推文示例:");
      tweets.slice(0, 3).forEach((tweet, index) => {
        console.log(`\n--- 推文 ${index + 1} ---`);
        console.log(`作者: ${tweet.authorName} (@${tweet.authorUsername})`);
        console.log(
          `内容: ${tweet.text.substring(0, 100)}${
            tweet.text.length > 100 ? "..." : ""
          }`
        );
        if (tweet.quotedTweet) {
          console.log(
            `引用推文作者: ${tweet.quotedTweet.authorName} (@${tweet.quotedTweet.authorUsername})`
          );
          console.log(
            `引用推文内容: ${tweet.quotedTweet.text.substring(0, 100)}${
              tweet.quotedTweet.text.length > 100 ? "..." : ""
            }`
          );
        }
      });
    }

    // 保存解析结果
    fs.writeFileSync("parsed-tweets.json", JSON.stringify(tweets, null, 2));
    console.log("\n解析结果已保存到 parsed-tweets.json");
  } catch (error) {
    console.error("测试失败:", error);
  }
}

testParser();
