// test-notion.js - Notion API 连接测试脚本

const { Client } = require("@notionhq/client");
require("dotenv").config(); // 如果您使用 .env 文件存储环境变量

// 从环境变量或直接设置获取凭据
const NOTION_API_KEY = process.env.NOTION_API_KEY || "your-api-key-here";
const DATABASE_ID = process.env.NOTION_DATABASE_ID || "your-database-id-here";

// 创建 Notion 客户端
const notion = new Client({
  auth: NOTION_API_KEY,
});

// 格式化输出函数
const formatOutput = (obj) => JSON.stringify(obj, null, 2);

// 测试数据库访问
async function testDatabaseAccess() {
  console.log(`\n===== 测试 Notion 数据库访问 =====`);
  console.log(`使用的数据库 ID: ${DATABASE_ID}`);

  try {
    const database = await notion.databases.retrieve({
      database_id: DATABASE_ID,
    });

    console.log(`✅ 数据库访问成功!`);
    console.log(`数据库标题: ${database.title?.[0]?.plain_text || "无标题"}`);
    console.log(`数据库 ID: ${database.id}`);
    console.log(`创建时间: ${database.created_time}`);
    console.log(`最后编辑时间: ${database.last_edited_time}`);

    // 显示数据库属性
    console.log(`\n数据库属性:`);
    Object.entries(database.properties).forEach(([key, value]) => {
      console.log(`- ${key} (${value.type})`);
    });

    return true;
  } catch (error) {
    console.error(`❌ 数据库访问失败:`);
    console.error(`错误信息: ${error.message}`);

    if (error.body) {
      console.error(`错误详情: ${formatOutput(error.body)}`);
    }

    return false;
  }
}

// 列出所有可访问的数据库
async function listAccessibleDatabases() {
  console.log(`\n===== 列出所有可访问的数据库 =====`);

  try {
    const response = await notion.search({
      filter: {
        property: "object",
        value: "database",
      },
    });

    if (response.results.length === 0) {
      console.log(`未找到可访问的数据库。`);
      return [];
    }

    console.log(`找到 ${response.results.length} 个可访问的数据库:`);

    response.results.forEach((db, index) => {
      const title = db.title?.[0]?.plain_text || "无标题";
      console.log(`\n${index + 1}. 数据库: ${title}`);
      console.log(`   ID: ${db.id}`);
      console.log(`   URL: ${db.url}`);
      console.log(`   创建时间: ${db.created_time}`);
    });

    return response.results;
  } catch (error) {
    console.error(`❌ 列出数据库失败:`);
    console.error(`错误信息: ${error.message}`);

    if (error.body) {
      console.error(`错误详情: ${formatOutput(error.body)}`);
    }

    return [];
  }
}

// 测试用户信息
async function testUserInfo() {
  console.log(`\n===== 测试用户信息 =====`);

  try {
    const response = await notion.users.list({});

    console.log(`✅ 用户信息获取成功!`);
    console.log(`找到 ${response.results.length} 个用户`);

    // 显示机器人用户信息
    const botUser = response.results.find((user) => user.type === "bot");
    if (botUser) {
      console.log(`\n机器人信息:`);
      console.log(`名称: ${botUser.name}`);
      console.log(`ID: ${botUser.id}`);
      console.log(`类型: ${botUser.type}`);
      console.log(`机器人所有者类型: ${botUser.bot?.owner?.type || "未知"}`);
    }

    return true;
  } catch (error) {
    console.error(`❌ 用户信息获取失败:`);
    console.error(`错误信息: ${error.message}`);

    if (error.body) {
      console.error(`错误详情: ${formatOutput(error.body)}`);
    }

    return false;
  }
}

// 主函数
async function main() {
  console.log(`开始测试 Notion API 连接...`);
  console.log(
    `API 密钥: ${NOTION_API_KEY.substring(0, 4)}...${NOTION_API_KEY.substring(
      NOTION_API_KEY.length - 4
    )}`
  );

  try {
    // 测试用户信息 (验证 API 密钥是否有效)
    await testUserInfo();

    // 测试数据库访问
    const dbAccessSuccessful = await testDatabaseAccess();

    // 如果数据库访问失败，列出所有可访问的数据库
    if (!dbAccessSuccessful) {
      console.log(`\n尝试列出所有可访问的数据库以帮助排查问题...`);
      const databases = await listAccessibleDatabases();

      if (databases.length > 0) {
        console.log(`\n建议: 请检查您是否使用了正确的数据库 ID。`);
        console.log(`您当前使用的数据库 ID: ${DATABASE_ID}`);
        console.log(`请尝试使用上面列出的其中一个数据库 ID。`);
      } else {
        console.log(`\n建议: 您的集成可能没有访问任何数据库的权限。`);
        console.log(`请确保您已将数据库共享给您的集成。`);
      }
    }
  } catch (error) {
    console.error(`测试过程中发生错误: ${error.message}`);
  }

  console.log(`\n测试完成!`);
}

// 运行测试
main();
