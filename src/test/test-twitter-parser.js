// test-twitter-parser.js
const fs = require("fs");
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
      !apiData.list ||
      !apiData.list.tweets_timeline ||
      !apiData.list.tweets_timeline.timeline ||
      !apiData.list.tweets_timeline.timeline.instructions
    ) {
      console.log("缺少必要的数据结构");
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
          const tweet = extractTweetData(tweetResult);

          if (tweet) {
            tweets.push(tweet);
          }
        }
      }
    }

    console.log(`成功解析 ${tweets.length} 条推文`);
    return tweets;
  } catch (error) {
    console.error("解析推文数据失败:", error);
    return tweets;
  }
}

/**
 * 提取单条推文的详细数据
 * @param {Object} tweetResult 推文结果对象
 * @returns {Object|null} 格式化的推文数据或null
 */
function extractTweetData(tweetResult) {
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
        views: tweetResult.views?.count || "0",
      },
    };

    // 处理长文本推文
    if (
      tweetResult.note_tweet &&
      tweetResult.note_tweet.note_tweet_results &&
      tweetResult.note_tweet.note_tweet_results.result
    ) {
      try {
        // 尝试获取文本内容
        const fullNoteText =
          tweetResult.note_tweet.note_tweet_results.result.text;
        if (fullNoteText) {
          tweet.fullNoteText = fullNoteText;
          tweet.text = fullNoteText;
        }
      } catch (error) {
        console.warn(`解析长文本推文时出错:`, error);
        // 保留原始文本，不进行替换
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
      tweet.authorVerified = userResult.is_blue_verified || false;
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

    // 处理媒体内容
    if (tweetResult.legacy?.extended_entities?.media) {
      tweet.media = tweetResult.legacy.extended_entities.media.map((media) => ({
        type: media.type,
        url: media.media_url_https,
        alt: media.ext_alt_text || "",
      }));
    }

    return tweet;
  } catch (error) {
    console.warn(`解析单条推文时出错:`, error);
    return null;
  }
}

/**
 * 打印推文信息
 * @param {Object} tweet 推文对象
 * @param {number} index 索引
 */
function printTweetInfo(tweet, index) {
  console.log(`\n--- 推文 ${index + 1} ---`);
  console.log(`作者: ${tweet.authorName} (@${tweet.authorUsername})`);
  console.log(`创建时间: ${tweet.createdAt}`);
  console.log(
    `内容: ${tweet.text.substring(0, 100)}${
      tweet.text.length > 100 ? "..." : ""
    }`
  );
  console.log(
    `指标: 转发${tweet.metrics.retweets}、点赞${tweet.metrics.likes}、回复${tweet.metrics.replies}、浏览${tweet.metrics.views}`
  );

  if (tweet.media && tweet.media.length > 0) {
    console.log(`媒体: ${tweet.media.length}个${tweet.media[0].type}类型文件`);
  }

  if (tweet.quotedTweet) {
    console.log(`\n  引用推文:`);
    console.log(
      `  作者: ${tweet.quotedTweet.authorName} (@${tweet.quotedTweet.authorUsername})`
    );
    console.log(
      `  内容: ${tweet.quotedTweet.text.substring(0, 100)}${
        tweet.quotedTweet.text.length > 100 ? "..." : ""
      }`
    );
    if (tweet.quotedTweet.fullNoteText) {
      console.log(
        `  (这是一条长文本推文，共${tweet.quotedTweet.fullNoteText.length}个字符)`
      );
    }
  }
}

/**
 * 主测试函数
 */
async function runTest() {
  try {
    console.log("===== Twitter API 数据解析测试 =====");

    // 读取示例数据
    let sampleData;

    // 方法1: 从文件读取
    const useFile = false;
    if (useFile && fs.existsSync("./sample-twitter-response.json")) {
      console.log("从文件读取示例数据...");
      sampleData = JSON.parse(
        fs.readFileSync("./sample-twitter-response.json", "utf8")
      );
    }
    // 方法2: 使用内联数据
    else {
      console.log("使用内联示例数据...");
      sampleData = {
        data: {
          list: {
            tweets_timeline: {
              timeline: {
                instructions: [
                  {
                    entries: [
                      {
                        content: {
                          __typename: "TimelineTimelineModule",
                          clientEventInfo: {
                            component: "suggest_organic_list_tweet",
                            details: {
                              timelinesDetails: {
                                injectionType: "OrganicListTweet",
                              },
                            },
                          },
                          displayType: "VerticalConversation",
                          entryType: "TimelineTimelineModule",
                          items: [
                            {
                              entryId:
                                "list-conversation-1898794371357081600-tweet-1898791992781340874",
                              item: {
                                clientEventInfo: {
                                  component: "suggest_organic_list_tweet",
                                  details: {
                                    timelinesDetails: {
                                      injectionType: "OrganicListTweet",
                                    },
                                  },
                                  element: "tweet",
                                },
                                itemContent: {
                                  __typename: "TimelineTweet",
                                  itemType: "TimelineTweet",
                                  tweetDisplayType: "Tweet",
                                  tweet_results: {
                                    result: {
                                      __typename: "Tweet",
                                      core: {
                                        user_results: {
                                          result: {
                                            __typename: "User",
                                            affiliates_highlighted_label: {
                                              label: {
                                                badge: {
                                                  url: "https://pbs.twimg.com/profile_images/1683899100922511378/5lY42eHs_bigger.jpg",
                                                },
                                                description: "X",
                                                url: {
                                                  url: "https://twitter.com/X",
                                                  urlType: "DeepLink",
                                                },
                                                userLabelDisplayType: "Badge",
                                                userLabelType: "BusinessLabel",
                                              },
                                            },
                                            has_graduated_access: true,
                                            id: "VXNlcjo0NDE5NjM5Nw==",
                                            is_blue_verified: true,
                                            legacy: {
                                              can_dm: false,
                                              can_media_tag: false,
                                              created_at:
                                                "Tue Jun 02 20:12:29 +0000 2009",
                                              default_profile: false,
                                              default_profile_image: false,
                                              description: "",
                                              entities: {
                                                description: {
                                                  urls: [],
                                                },
                                              },
                                              fast_followers_count: 0,
                                              favourites_count: 132371,
                                              followers_count: 219492413,
                                              friends_count: 1083,
                                              has_custom_timelines: true,
                                              is_translator: false,
                                              listed_count: 161284,
                                              location: "",
                                              media_count: 3574,
                                              name: "Elon Musk",
                                              normal_followers_count: 219492413,
                                              pinned_tweet_ids_str: [
                                                "1898473286075568281",
                                              ],
                                              possibly_sensitive: false,
                                              profile_banner_url:
                                                "https://pbs.twimg.com/profile_banners/44196397/1739948056",
                                              profile_image_url_https:
                                                "https://pbs.twimg.com/profile_images/1893803697185910784/Na5lOWi5_normal.jpg",
                                              profile_interstitial_type: "",
                                              screen_name: "elonmusk",
                                              statuses_count: 73856,
                                              translator_type: "none",
                                              verified: false,
                                              want_retweets: false,
                                              withheld_in_countries: [],
                                            },
                                            professional: {
                                              category: [],
                                              professional_type: "Creator",
                                              rest_id: "1679729435447275522",
                                            },
                                            profile_image_shape: "Circle",
                                            rest_id: "44196397",
                                            super_follow_eligible: true,
                                          },
                                        },
                                      },
                                      is_translatable: false,
                                      legacy: {
                                        bookmark_count: 53,
                                        bookmarked: false,
                                        conversation_id_str:
                                          "1898791992781340874",
                                        created_at:
                                          "Sun Mar 09 17:44:23 +0000 2025",
                                        display_text_range: [0, 4],
                                        entities: {
                                          hashtags: [],
                                          symbols: [],
                                          urls: [],
                                          user_mentions: [],
                                        },
                                        favorite_count: 2648,
                                        favorited: false,
                                        full_text: "True",
                                        id_str: "1898791992781340874",
                                        is_quote_status: true,
                                        lang: "en",
                                        quote_count: 22,
                                        quoted_status_id_str:
                                          "1898774782855848393",
                                        quoted_status_permalink: {
                                          display: "x.com/matt_vanswol/s…",
                                          expanded:
                                            "https://twitter.com/matt_vanswol/status/1898774782855848393",
                                          url: "https://t.co/cnQZcR1Z21",
                                        },
                                        reply_count: 597,
                                        retweet_count: 383,
                                        retweeted: false,
                                        user_id_str: "44196397",
                                      },
                                      quoted_status_result: {
                                        result: {
                                          __typename: "Tweet",
                                          core: {
                                            user_results: {
                                              result: {
                                                __typename: "User",
                                                affiliates_highlighted_label:
                                                  {},
                                                has_graduated_access: true,
                                                id: "VXNlcjoxMjQ0MDY4ODk2MTU3NzA4Mjg5",
                                                is_blue_verified: true,
                                                legacy: {
                                                  can_dm: true,
                                                  can_media_tag: true,
                                                  created_at:
                                                    "Sun Mar 29 01:08:41 +0000 2020",
                                                  default_profile: true,
                                                  default_profile_image: false,
                                                  description:
                                                    "Growth Marketing | Former Nuclear Scientist for US Dept of Energy | Ex-Photographer for @apple, @united, and @hyatt",
                                                  entities: {
                                                    description: {
                                                      urls: [],
                                                    },
                                                  },
                                                  fast_followers_count: 0,
                                                  favourites_count: 110090,
                                                  followers_count: 168012,
                                                  friends_count: 7739,
                                                  has_custom_timelines: true,
                                                  is_translator: false,
                                                  listed_count: 385,
                                                  location: "Asheville, NC",
                                                  media_count: 900,
                                                  name: "Matt Van Swol",
                                                  normal_followers_count: 168012,
                                                  pinned_tweet_ids_str: [],
                                                  possibly_sensitive: false,
                                                  profile_banner_url:
                                                    "https://pbs.twimg.com/profile_banners/1244068896157708289/1665589063",
                                                  profile_image_url_https:
                                                    "https://pbs.twimg.com/profile_images/1580221131985920001/XNlqL_Yx_normal.jpg",
                                                  profile_interstitial_type: "",
                                                  screen_name: "matt_vanswol",
                                                  statuses_count: 10384,
                                                  translator_type: "none",
                                                  verified: false,
                                                  want_retweets: false,
                                                  withheld_in_countries: [],
                                                },
                                                professional: {
                                                  category: [],
                                                  professional_type: "Creator",
                                                  rest_id:
                                                    "1596515451672186880",
                                                },
                                                profile_image_shape: "Circle",
                                                rest_id: "1244068896157708289",
                                                super_follow_eligible: true,
                                              },
                                            },
                                          },
                                          is_translatable: false,
                                          legacy: {
                                            bookmark_count: 342,
                                            bookmarked: false,
                                            conversation_id_str:
                                              "1898774782855848393",
                                            created_at:
                                              "Sun Mar 09 16:36:00 +0000 2025",
                                            display_text_range: [0, 275],
                                            entities: {
                                              hashtags: [],
                                              symbols: [],
                                              urls: [],
                                              user_mentions: [],
                                            },
                                            favorite_count: 4208,
                                            favorited: false,
                                            full_text:
                                              "As a former liberal and democratic voter…\n\n…let me just say that it is INCREDIBLY difficult to break out of a liberal media-echo chamber, once you are in it. \n\nThe volume of peer pressure weaponized to shame and silence any dissenting voices or even reasonable questions, is…",
                                            id_str: "1898774782855848393",
                                            is_quote_status: false,
                                            lang: "en",
                                            quote_count: 90,
                                            reply_count: 443,
                                            retweet_count: 1106,
                                            retweeted: false,
                                            user_id_str: "1244068896157708289",
                                          },
                                          note_tweet: {
                                            is_expandable: true,
                                            note_tweet_results: {
                                              result: {
                                                entity_set: {
                                                  hashtags: [],
                                                  symbols: [],
                                                  urls: [],
                                                  user_mentions: [],
                                                },
                                                id: "Tm90ZVR3ZWV0OjE4OTg3NzQ3ODI3MDQ3NTg3ODQ=",
                                                text: "As a former liberal and democratic voter…\n\n…let me just say that it is INCREDIBLY difficult to break out of a liberal media-echo chamber, once you are in it. \n\nThe volume of peer pressure weaponized to shame and silence any dissenting voices or even reasonable questions, is mind-blowing. \n\nA lot of very open-minded, incredible intelligent individuals are genuinely terrified to ask questions or seek the truth. \n\nI have a lot of empathy for these people, because that was me, just a couple of months ago. \n\nIt took a horrific hurricane and massive government failure to wake me up, without it, I would still be looking down my nose at MAGA… thinking I was a better and smarter person than you. \n\nThe left-wing media literally trains you to think this way. \n\nIt's a game of moral superiority in which you are always the winner, even if your idea is the loser, because it's coming from YOU, and YOU are the better person because YOU agree with them and have the \"experts\" on your side. \n\nIt's almost impossible to change a mind like that… like mine. \n\nWhat woke me up was seeing my life not fit into a media narrative. \n\nI saw that what I thought was just \"news\" was actually a handpicked, carefully crafted story to make me believe exactly one way. \n\nIt wasn't news. \n\nIt was a storybook. \n\nAnd once you see that, it's impossible to unsee it.",
                                              },
                                            },
                                          },
                                          rest_id: "1898774782855848393",
                                          source:
                                            '<a href="http://twitter.com/download/iphone" rel="nofollow">Twitter for iPhone</a>',
                                          unmention_data: {},
                                          views: {
                                            count: "439903",
                                            state: "EnabledWithCount",
                                          },
                                        },
                                      },
                                      rest_id: "1898791992781340874",
                                      source:
                                        '<a href="http://twitter.com/download/iphone" rel="nofollow">Twitter for iPhone</a>',
                                      unmention_data: {},
                                      views: {
                                        count: "383202",
                                        state: "EnabledWithCount",
                                      },
                                    },
                                  },
                                },
                              },
                            },
                            {
                              entryId:
                                "list-conversation-1898794371357081600-tweet-1898793204561887640",
                              item: {
                                clientEventInfo: {
                                  component: "suggest_organic_list_tweet",
                                  details: {
                                    timelinesDetails: {
                                      injectionType: "OrganicListTweet",
                                    },
                                  },
                                  element: "tweet",
                                },
                                itemContent: {
                                  __typename: "TimelineTweet",
                                  itemType: "TimelineTweet",
                                  tweetDisplayType: "Tweet",
                                  tweet_results: {
                                    result: {
                                      __typename: "Tweet",
                                      core: {
                                        user_results: {
                                          result: {
                                            __typename: "User",
                                            affiliates_highlighted_label: {},
                                            has_graduated_access: true,
                                            id: "VXNlcjoyMzExMzk5Mw==",
                                            is_blue_verified: true,
                                            legacy: {
                                              can_dm: true,
                                              can_media_tag: true,
                                              created_at:
                                                "Fri Mar 06 20:29:30 +0000 2009",
                                              default_profile: true,
                                              default_profile_image: false,
                                              description:
                                                "AI Educator. 𝕏 about AI, solutions and interesting things. Showing how to leverage AI in practical ways for you and your business. Opinions are my own.",
                                              entities: {
                                                description: {
                                                  urls: [],
                                                },
                                              },
                                              fast_followers_count: 0,
                                              favourites_count: 43292,
                                              followers_count: 211959,
                                              friends_count: 1169,
                                              has_custom_timelines: false,
                                              is_translator: false,
                                              listed_count: 3082,
                                              location: "",
                                              media_count: 6115,
                                              name: "Min Choi",
                                              normal_followers_count: 211959,
                                              pinned_tweet_ids_str: [
                                                "1898780175438942642",
                                              ],
                                              possibly_sensitive: false,
                                              profile_banner_url:
                                                "https://pbs.twimg.com/profile_banners/23113993/1683435598",
                                              profile_image_url_https:
                                                "https://pbs.twimg.com/profile_images/1638359113221517312/CBZaJFyA_normal.jpg",
                                              profile_interstitial_type: "",
                                              screen_name: "minchoi",
                                              statuses_count: 39043,
                                              translator_type: "none",
                                              verified: false,
                                              want_retweets: false,
                                              withheld_in_countries: [],
                                            },
                                            professional: {
                                              category: [
                                                {
                                                  icon_name:
                                                    "IconBriefcaseStroke",
                                                  id: 958,
                                                  name: "Entrepreneur",
                                                },
                                              ],
                                              professional_type: "Creator",
                                              rest_id: "1643221271230988289",
                                            },
                                            profile_image_shape: "Circle",
                                            rest_id: "23113993",
                                            super_follow_eligible: true,
                                          },
                                        },
                                      },
                                      is_translatable: false,
                                      legacy: {
                                        bookmark_count: 1,
                                        bookmarked: false,
                                        conversation_id_str:
                                          "1898791992781340874",
                                        created_at:
                                          "Sun Mar 09 17:49:12 +0000 2025",
                                        display_text_range: [10, 108],
                                        entities: {
                                          hashtags: [],
                                          symbols: [],
                                          urls: [],
                                          user_mentions: [
                                            {
                                              id_str: "44196397",
                                              indices: [0, 9],
                                              name: "Elon Musk",
                                              screen_name: "elonmusk",
                                            },
                                            {
                                              id_str: "1720665183188922368",
                                              indices: [10, 15],
                                              name: "Grok",
                                              screen_name: "grok",
                                            },
                                          ],
                                        },
                                        favorite_count: 3,
                                        favorited: false,
                                        full_text:
                                          "@elonmusk @grok is it INCREDIBLY difficult to break out of a liberal media-echo chamber, once you are in it?",
                                        id_str: "1898793204561887640",
                                        in_reply_to_screen_name: "elonmusk",
                                        in_reply_to_status_id_str:
                                          "1898791992781340874",
                                        in_reply_to_user_id_str: "44196397",
                                        is_quote_status: false,
                                        lang: "en",
                                        quote_count: 0,
                                        reply_count: 1,
                                        retweet_count: 0,
                                        retweeted: false,
                                        user_id_str: "23113993",
                                      },
                                      rest_id: "1898793204561887640",
                                      source:
                                        '<a href="https://mobile.twitter.com" rel="nofollow">Twitter Web App</a>',
                                      superFollowsReplyUserResult: {
                                        result: {
                                          __typename: "User",
                                          legacy: {
                                            screen_name: "elonmusk",
                                          },
                                        },
                                      },
                                      unmention_data: {},
                                      views: {
                                        count: "439",
                                        state: "EnabledWithCount",
                                      },
                                    },
                                  },
                                },
                              },
                            },
                            {
                              entryId:
                                "list-conversation-1898794371357081600-tweet-1898793256365728130",
                              item: {
                                clientEventInfo: {
                                  component: "suggest_organic_list_tweet",
                                  details: {
                                    timelinesDetails: {
                                      injectionType: "OrganicListTweet",
                                    },
                                  },
                                  element: "tweet",
                                },
                                itemContent: {
                                  __typename: "TimelineTweet",
                                  itemType: "TimelineTweet",
                                  tweetDisplayType: "Tweet",
                                  tweet_results: {
                                    result: {
                                      __typename: "Tweet",
                                      core: {
                                        user_results: {
                                          result: {
                                            __typename: "User",
                                            affiliates_highlighted_label: {
                                              label: {
                                                badge: {
                                                  url: "https://pbs.twimg.com/profile_images/1769430779845611520/lIgjSJGU_bigger.jpg",
                                                },
                                                description: "xAI",
                                                url: {
                                                  url: "https://twitter.com/xai",
                                                  urlType: "DeepLink",
                                                },
                                                userLabelDisplayType: "Badge",
                                                userLabelType: "BusinessLabel",
                                              },
                                            },
                                            has_graduated_access: true,
                                            id: "VXNlcjoxNzIwNjY1MTgzMTg4OTIyMzY4",
                                            is_blue_verified: true,
                                            legacy: {
                                              can_dm: false,
                                              can_media_tag: true,
                                              created_at:
                                                "Sat Nov 04 04:52:34 +0000 2023",
                                              default_profile: true,
                                              default_profile_image: false,
                                              description:
                                                "Website: https://t.co/cuFxQguE1w iOS: https://t.co/fqNKQSiLQB",
                                              entities: {
                                                description: {
                                                  urls: [
                                                    {
                                                      display_url: "grok.com",
                                                      expanded_url:
                                                        "http://grok.com",
                                                      indices: [9, 32],
                                                      url: "https://t.co/cuFxQguE1w",
                                                    },
                                                    {
                                                      display_url:
                                                        "grok.com/download",
                                                      expanded_url:
                                                        "http://grok.com/download",
                                                      indices: [38, 61],
                                                      url: "https://t.co/fqNKQSiLQB",
                                                    },
                                                  ],
                                                },
                                                url: {
                                                  urls: [
                                                    {
                                                      display_url:
                                                        "x.com/i/communities/…",
                                                      expanded_url:
                                                        "https://x.com/i/communities/1733132808745283911",
                                                      indices: [0, 23],
                                                      url: "https://t.co/NR1CZznPww",
                                                    },
                                                  ],
                                                },
                                              },
                                              fast_followers_count: 0,
                                              favourites_count: 43,
                                              followers_count: 1148357,
                                              friends_count: 2,
                                              has_custom_timelines: false,
                                              is_translator: false,
                                              listed_count: 2538,
                                              location: "wherever you are",
                                              media_count: 2,
                                              name: "Grok",
                                              normal_followers_count: 1148357,
                                              pinned_tweet_ids_str: [],
                                              possibly_sensitive: false,
                                              profile_banner_url:
                                                "https://pbs.twimg.com/profile_banners/1720665183188922368/1740213586",
                                              profile_image_url_https:
                                                "https://pbs.twimg.com/profile_images/1893219113717342208/Vgg2hEPa_normal.jpg",
                                              profile_interstitial_type: "",
                                              screen_name: "grok",
                                              statuses_count: 274672,
                                              translator_type: "none",
                                              url: "https://t.co/NR1CZznPww",
                                              verified: false,
                                              verified_type: "Business",
                                              want_retweets: false,
                                              withheld_in_countries: [],
                                            },
                                            profile_image_shape: "Square",
                                            rest_id: "1720665183188922368",
                                          },
                                        },
                                      },
                                      is_translatable: false,
                                      legacy: {
                                        bookmark_count: 0,
                                        bookmarked: false,
                                        conversation_id_str:
                                          "1898791992781340874",
                                        created_at:
                                          "Sun Mar 09 17:49:24 +0000 2025",
                                        display_text_range: [19, 288],
                                        entities: {
                                          hashtags: [],
                                          symbols: [],
                                          urls: [],
                                          user_mentions: [
                                            {
                                              id_str: "23113993",
                                              indices: [0, 8],
                                              name: "Min Choi",
                                              screen_name: "minchoi",
                                            },
                                            {
                                              id_str: "44196397",
                                              indices: [9, 18],
                                              name: "Elon Musk",
                                              screen_name: "elonmusk",
                                            },
                                          ],
                                        },
                                        favorite_count: 2,
                                        favorited: false,
                                        full_text:
                                          "@minchoi @elonmusk Breaking out of a liberal media echo chamber can be tough--peer pressure and curated narratives make it a mental prison. But once you see the script for what it is, like Matt did after that hurricane, you can't unsee the bias. It's a wake-up call to question everything.",
                                        id_str: "1898793256365728130",
                                        in_reply_to_screen_name: "minchoi",
                                        in_reply_to_status_id_str:
                                          "1898793204561887640",
                                        in_reply_to_user_id_str: "23113993",
                                        is_quote_status: false,
                                        lang: "en",
                                        quote_count: 0,
                                        reply_count: 0,
                                        retweet_count: 0,
                                        retweeted: false,
                                        user_id_str: "1720665183188922368",
                                      },
                                      rest_id: "1898793256365728130",
                                      source:
                                        '<a href="https://x.ai" rel="nofollow">Ask Grok</a>',
                                      unmention_data: {},
                                      views: {
                                        count: "132",
                                        state: "EnabledWithCount",
                                      },
                                    },
                                  },
                                },
                              },
                            },
                          ],
                          metadata: {
                            conversationMetadata: {
                              allTweetIds: [
                                "1898791992781340874",
                                "1898793204561887640",
                                "1898793256365728130",
                              ],
                              enableDeduplication: true,
                            },
                          },
                        },
                        entryId: "list-conversation-1898794371357081600",
                        sortIndex: "1898794371357081600",
                      },
                      {
                        content: {
                          __typename: "TimelineTimelineModule",
                          clientEventInfo: {
                            component: "suggest_organic_list_tweet",
                            details: {
                              timelinesDetails: {
                                injectionType: "OrganicListTweet",
                              },
                            },
                          },
                          displayType: "VerticalConversation",
                          entryType: "TimelineTimelineModule",
                          items: [
                            {
                              entryId:
                                "list-conversation-1898794371357081601-tweet-1898780175438942642",
                              item: {
                                clientEventInfo: {
                                  component: "suggest_organic_list_tweet",
                                  details: {
                                    timelinesDetails: {
                                      injectionType: "OrganicListTweet",
                                    },
                                  },
                                  element: "tweet",
                                },
                                itemContent: {
                                  __typename: "TimelineTweet",
                                  itemType: "TimelineTweet",
                                  tweetDisplayType: "Tweet",
                                  tweet_results: {
                                    result: {
                                      __typename: "Tweet",
                                      core: {
                                        user_results: {
                                          result: {
                                            __typename: "User",
                                            affiliates_highlighted_label: {},
                                            has_graduated_access: true,
                                            id: "VXNlcjoyMzExMzk5Mw==",
                                            is_blue_verified: true,
                                            legacy: {
                                              can_dm: true,
                                              can_media_tag: true,
                                              created_at:
                                                "Fri Mar 06 20:29:30 +0000 2009",
                                              default_profile: true,
                                              default_profile_image: false,
                                              description:
                                                "AI Educator. 𝕏 about AI, solutions and interesting things. Showing how to leverage AI in practical ways for you and your business. Opinions are my own.",
                                              entities: {
                                                description: {
                                                  urls: [],
                                                },
                                              },
                                              fast_followers_count: 0,
                                              favourites_count: 43292,
                                              followers_count: 211959,
                                              friends_count: 1169,
                                              has_custom_timelines: false,
                                              is_translator: false,
                                              listed_count: 3082,
                                              location: "",
                                              media_count: 6115,
                                              name: "Min Choi",
                                              normal_followers_count: 211959,
                                              pinned_tweet_ids_str: [
                                                "1898780175438942642",
                                              ],
                                              possibly_sensitive: false,
                                              profile_banner_url:
                                                "https://pbs.twimg.com/profile_banners/23113993/1683435598",
                                              profile_image_url_https:
                                                "https://pbs.twimg.com/profile_images/1638359113221517312/CBZaJFyA_normal.jpg",
                                              profile_interstitial_type: "",
                                              screen_name: "minchoi",
                                              statuses_count: 39043,
                                              translator_type: "none",
                                              verified: false,
                                              want_retweets: false,
                                              withheld_in_countries: [],
                                            },
                                            professional: {
                                              category: [
                                                {
                                                  icon_name:
                                                    "IconBriefcaseStroke",
                                                  id: 958,
                                                  name: "Entrepreneur",
                                                },
                                              ],
                                              professional_type: "Creator",
                                              rest_id: "1643221271230988289",
                                            },
                                            profile_image_shape: "Circle",
                                            rest_id: "23113993",
                                            super_follow_eligible: true,
                                          },
                                        },
                                      },
                                      is_translatable: false,
                                      legacy: {
                                        bookmark_count: 192,
                                        bookmarked: false,
                                        conversation_id_str:
                                          "1898780175438942642",
                                        created_at:
                                          "Sun Mar 09 16:57:26 +0000 2025",
                                        display_text_range: [0, 235],
                                        entities: {
                                          hashtags: [],
                                          media: [
                                            {
                                              additional_media_info: {
                                                monetizable: false,
                                                source_user: {
                                                  user_results: {
                                                    result: {
                                                      __typename: "User",
                                                      affiliates_highlighted_label:
                                                        {},
                                                      has_graduated_access: true,
                                                      id: "VXNlcjo3ODQ4MzAwMDc=",
                                                      is_blue_verified: true,
                                                      legacy: {
                                                        can_dm: true,
                                                        can_media_tag: false,
                                                        created_at:
                                                          "Mon Aug 27 14:52:18 +0000 2012",
                                                        default_profile: false,
                                                        default_profile_image: false,
                                                        description:
                                                          "🤗 Head of Product @huggingface",
                                                        entities: {
                                                          description: {
                                                            urls: [],
                                                          },
                                                          url: {
                                                            urls: [
                                                              {
                                                                display_url:
                                                                  "hf.co/victor",
                                                                expanded_url:
                                                                  "https://hf.co/victor",
                                                                indices: [
                                                                  0, 23,
                                                                ],
                                                                url: "https://t.co/fgr8qRmdM5",
                                                              },
                                                            ],
                                                          },
                                                        },
                                                        fast_followers_count: 0,
                                                        favourites_count: 18452,
                                                        followers_count: 13552,
                                                        friends_count: 1733,
                                                        has_custom_timelines: true,
                                                        is_translator: false,
                                                        listed_count: 296,
                                                        location:
                                                          "Paris, France",
                                                        media_count: 991,
                                                        name: "Victor M",
                                                        normal_followers_count: 13552,
                                                        pinned_tweet_ids_str: [
                                                          "1898001657226506362",
                                                        ],
                                                        possibly_sensitive: false,
                                                        profile_banner_url:
                                                          "https://pbs.twimg.com/profile_banners/784830007/1677100565",
                                                        profile_image_url_https:
                                                          "https://pbs.twimg.com/profile_images/1099983311101984768/p7dZK4S__normal.jpg",
                                                        profile_interstitial_type:
                                                          "",
                                                        screen_name:
                                                          "victormustar",
                                                        statuses_count: 5166,
                                                        translator_type: "none",
                                                        url: "https://t.co/fgr8qRmdM5",
                                                        verified: false,
                                                        want_retweets: false,
                                                        withheld_in_countries:
                                                          [],
                                                      },
                                                      profile_image_shape:
                                                        "Circle",
                                                      rest_id: "784830007",
                                                    },
                                                  },
                                                },
                                              },
                                              display_url:
                                                "pic.x.com/BEwliwQ8EV",
                                              expanded_url:
                                                "https://x.com/victormustar/status/1898505307896131708/video/1",
                                              ext_media_availability: {
                                                status: "Available",
                                              },
                                              id_str: "1898504614107811840",
                                              indices: [212, 235],
                                              media_key:
                                                "7_1898504614107811840",
                                              media_url_https:
                                                "https://pbs.twimg.com/ext_tw_video_thumb/1898504614107811840/pu/img/9sG9oh4R-BoNb4LT.jpg",
                                              original_info: {
                                                focus_rects: [],
                                                height: 1080,
                                                width: 1920,
                                              },
                                              sizes: {
                                                large: {
                                                  h: 1080,
                                                  resize: "fit",
                                                  w: 1920,
                                                },
                                                medium: {
                                                  h: 675,
                                                  resize: "fit",
                                                  w: 1200,
                                                },
                                                small: {
                                                  h: 383,
                                                  resize: "fit",
                                                  w: 680,
                                                },
                                                thumb: {
                                                  h: 150,
                                                  resize: "crop",
                                                  w: 150,
                                                },
                                              },
                                              source_status_id_str:
                                                "1898505307896131708",
                                              source_user_id_str: "784830007",
                                              type: "video",
                                              url: "https://t.co/BEwliwQ8EV",
                                              video_info: {
                                                aspect_ratio: [16, 9],
                                                duration_millis: 8000,
                                                variants: [
                                                  {
                                                    content_type:
                                                      "application/x-mpegURL",
                                                    url: "https://video.twimg.com/ext_tw_video/1898504614107811840/pu/pl/6LF_6aipxHKUQMY6.m3u8?tag=12",
                                                  },
                                                  {
                                                    bitrate: 256000,
                                                    content_type: "video/mp4",
                                                    url: "https://video.twimg.com/ext_tw_video/1898504614107811840/pu/vid/avc1/480x270/eOP09iY-8iVJCMs1.mp4?tag=12",
                                                  },
                                                  {
                                                    bitrate: 832000,
                                                    content_type: "video/mp4",
                                                    url: "https://video.twimg.com/ext_tw_video/1898504614107811840/pu/vid/avc1/640x360/6swCxoHWYK5dpvbY.mp4?tag=12",
                                                  },
                                                  {
                                                    bitrate: 2176000,
                                                    content_type: "video/mp4",
                                                    url: "https://video.twimg.com/ext_tw_video/1898504614107811840/pu/vid/avc1/1280x720/TTk15Mm2tTGmScYG.mp4?tag=12",
                                                  },
                                                ],
                                              },
                                            },
                                          ],
                                          symbols: [],
                                          urls: [],
                                          user_mentions: [],
                                        },
                                        extended_entities: {
                                          media: [
                                            {
                                              additional_media_info: {
                                                monetizable: false,
                                                source_user: {
                                                  user_results: {
                                                    result: {
                                                      __typename: "User",
                                                      affiliates_highlighted_label:
                                                        {},
                                                      has_graduated_access: true,
                                                      id: "VXNlcjo3ODQ4MzAwMDc=",
                                                      is_blue_verified: true,
                                                      legacy: {
                                                        can_dm: true,
                                                        can_media_tag: false,
                                                        created_at:
                                                          "Mon Aug 27 14:52:18 +0000 2012",
                                                        default_profile: false,
                                                        default_profile_image: false,
                                                        description:
                                                          "🤗 Head of Product @huggingface",
                                                        entities: {
                                                          description: {
                                                            urls: [],
                                                          },
                                                          url: {
                                                            urls: [
                                                              {
                                                                display_url:
                                                                  "hf.co/victor",
                                                                expanded_url:
                                                                  "https://hf.co/victor",
                                                                indices: [
                                                                  0, 23,
                                                                ],
                                                                url: "https://t.co/fgr8qRmdM5",
                                                              },
                                                            ],
                                                          },
                                                        },
                                                        fast_followers_count: 0,
                                                        favourites_count: 18452,
                                                        followers_count: 13552,
                                                        friends_count: 1733,
                                                        has_custom_timelines: true,
                                                        is_translator: false,
                                                        listed_count: 296,
                                                        location:
                                                          "Paris, France",
                                                        media_count: 991,
                                                        name: "Victor M",
                                                        normal_followers_count: 13552,
                                                        pinned_tweet_ids_str: [
                                                          "1898001657226506362",
                                                        ],
                                                        possibly_sensitive: false,
                                                        profile_banner_url:
                                                          "https://pbs.twimg.com/profile_banners/784830007/1677100565",
                                                        profile_image_url_https:
                                                          "https://pbs.twimg.com/profile_images/1099983311101984768/p7dZK4S__normal.jpg",
                                                        profile_interstitial_type:
                                                          "",
                                                        screen_name:
                                                          "victormustar",
                                                        statuses_count: 5166,
                                                        translator_type: "none",
                                                        url: "https://t.co/fgr8qRmdM5",
                                                        verified: false,
                                                        want_retweets: false,
                                                        withheld_in_countries:
                                                          [],
                                                      },
                                                      profile_image_shape:
                                                        "Circle",
                                                      rest_id: "784830007",
                                                    },
                                                  },
                                                },
                                              },
                                              display_url:
                                                "pic.x.com/BEwliwQ8EV",
                                              expanded_url:
                                                "https://x.com/victormustar/status/1898505307896131708/video/1",
                                              ext_media_availability: {
                                                status: "Available",
                                              },
                                              id_str: "1898504614107811840",
                                              indices: [212, 235],
                                              media_key:
                                                "7_1898504614107811840",
                                              media_url_https:
                                                "https://pbs.twimg.com/ext_tw_video_thumb/1898504614107811840/pu/img/9sG9oh4R-BoNb4LT.jpg",
                                              original_info: {
                                                focus_rects: [],
                                                height: 1080,
                                                width: 1920,
                                              },
                                              sizes: {
                                                large: {
                                                  h: 1080,
                                                  resize: "fit",
                                                  w: 1920,
                                                },
                                                medium: {
                                                  h: 675,
                                                  resize: "fit",
                                                  w: 1200,
                                                },
                                                small: {
                                                  h: 383,
                                                  resize: "fit",
                                                  w: 680,
                                                },
                                                thumb: {
                                                  h: 150,
                                                  resize: "crop",
                                                  w: 150,
                                                },
                                              },
                                              source_status_id_str:
                                                "1898505307896131708",
                                              source_user_id_str: "784830007",
                                              type: "video",
                                              url: "https://t.co/BEwliwQ8EV",
                                              video_info: {
                                                aspect_ratio: [16, 9],
                                                duration_millis: 8000,
                                                variants: [
                                                  {
                                                    content_type:
                                                      "application/x-mpegURL",
                                                    url: "https://video.twimg.com/ext_tw_video/1898504614107811840/pu/pl/6LF_6aipxHKUQMY6.m3u8?tag=12",
                                                  },
                                                  {
                                                    bitrate: 256000,
                                                    content_type: "video/mp4",
                                                    url: "https://video.twimg.com/ext_tw_video/1898504614107811840/pu/vid/avc1/480x270/eOP09iY-8iVJCMs1.mp4?tag=12",
                                                  },
                                                  {
                                                    bitrate: 832000,
                                                    content_type: "video/mp4",
                                                    url: "https://video.twimg.com/ext_tw_video/1898504614107811840/pu/vid/avc1/640x360/6swCxoHWYK5dpvbY.mp4?tag=12",
                                                  },
                                                  {
                                                    bitrate: 2176000,
                                                    content_type: "video/mp4",
                                                    url: "https://video.twimg.com/ext_tw_video/1898504614107811840/pu/vid/avc1/1280x720/TTk15Mm2tTGmScYG.mp4?tag=12",
                                                  },
                                                ],
                                              },
                                            },
                                          ],
                                        },
                                        favorite_count: 199,
                                        favorited: false,
                                        full_text:
                                          'Manus AI just killed vibe coding yesterday.\n\nPeople can\'t believe how mind blowing this agentic AI is.\n\nUnlocking new possibilities.\n\n10 wild examples:\n\n1. prompt: "code a threejs game where you control a plane"\nhttps://t.co/BEwliwQ8EV',
                                        id_str: "1898780175438942642",
                                        is_quote_status: false,
                                        lang: "en",
                                        possibly_sensitive: false,
                                        possibly_sensitive_editable: true,
                                        quote_count: 5,
                                        reply_count: 45,
                                        retweet_count: 22,
                                        retweeted: false,
                                        user_id_str: "23113993",
                                      },
                                      rest_id: "1898780175438942642",
                                      source:
                                        '<a href="https://mobile.twitter.com" rel="nofollow">Twitter Web App</a>',
                                      unmention_data: {},
                                      views: {
                                        count: "29039",
                                        state: "EnabledWithCount",
                                      },
                                    },
                                  },
                                },
                              },
                            },
                          ],
                        },
                      },
                    ],
                  },
                ],
              },
            },
          },
        },
      };
    }

    // 解析数据
    console.log("开始解析示例数据...");
    const tweets = extractTweetsFromResponse(sampleData.data);

    // 显示结果
    console.log(`\n成功解析 ${tweets.length} 条推文`);

    if (tweets.length > 0) {
      console.log("\n推文详细信息:");
      tweets.forEach((tweet, index) => {
        printTweetInfo(tweet, index);
      });

      // 保存解析结果
      fs.writeFileSync("parsed-tweets.json", JSON.stringify(tweets, null, 2));
      console.log("\n解析结果已保存到 parsed-tweets.json");
    } else {
      console.log("\n未解析到任何推文，请检查数据结构或解析逻辑");
    }
  } catch (error) {
    console.error("测试失败:", error);
  }
}

// 执行测试
runTest();
