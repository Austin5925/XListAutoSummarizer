// TweetDetail API 测试脚本
async function testTweetDetailAPI() {
  // API 配置
  const apiUrl = "https://api.apidance.pro/sapi/TweetDetail";
  const apiKey = "bol65dbi1imo4jjptx0wmd7llv2zg3"; // 请替换为您的实际 API 密钥
  const tweetId = "1899373710382899693"; // 可以替换为您要查询的推文 ID

  // 可选参数
  const cursor = ""; // 如果需要分页，可以添加 cursor 值

  // 构建 URL
  let url = `${apiUrl}?tweet_id=${tweetId}`;
  if (cursor) {
    url += `&cursor=${cursor}`;
  }

  try {
    // 发送请求
    const response = await fetch(url, {
      method: "GET",
      headers: {
        apikey: apiKey,
      },
    });

    // 解析响应
    const data = await response.json();

    // 输出结果
    console.log("状态码:", response.status);
    console.log("响应数据:", data);

    return data;
  } catch (error) {
    console.error("请求失败:", error);
    throw error;
  }
}

// 执行测试
testTweetDetailAPI()
  .then((result) => {
    console.log("测试完成");
  })
  .catch((error) => {
    console.log("测试出错");
  });
