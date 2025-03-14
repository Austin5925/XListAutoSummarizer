// src/config.js
require("dotenv").config();
const path = require("path");

module.exports = {
  twitter: {
    apiKey: process.env.TWITTER_API_KEY,
    listId: process.env.TWITTER_LIST_ID,
    apiUrlList: "https://api.apidance.pro/graphql/ListLatestTweetsTimeline",
    apiUrlTweet: "https://api.apidance.pro/sapi/TweetDetail",
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    apiUrl: "https://ai.pumpkinai.online/v1",
    model: "o3-mini",
    chunkSize: parseInt(process.env.GPT_CHUNK_SIZE || "20"),
  },
  notion: {
    apiKey: process.env.NOTION_API_KEY,
    databaseId: process.env.NOTION_DATABASE_ID,
  },
  cronSchedule: process.env.CRON_SCHEDULE || "0 18 * * *",
  paths: {
    data: path.join(__dirname, "..", "data"),
    tweets: path.join(__dirname, "..", "data", "tweets"),
    analysis: path.join(__dirname, "..", "data", "analysis"),
  },
};

//gpt-4o-2024-11-20   o3-mini
