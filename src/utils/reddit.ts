import Snoowrap from 'snoowrap';

import { join } from 'path';
import { readFileSync, writeFileSync } from 'fs';
import { randomInt } from 'crypto';

import { markdownToTxt as removeMarkdown } from 'markdown-to-txt';

import { existsAndHasContent } from './fs';
import { redditDir } from './dirs';
import { validateConfig } from './config';
const trackingFile = join(redditDir, 'tracking.json');
const trackingObj = existsAndHasContent(trackingFile) ? JSON.parse(readFileSync(trackingFile).toString()) : {};

function fixStory(story: {
    id: string,
    title: string,
    content: string,
    subreddit: string,
}) {
  const newContent = removeMarkdown(story.content.split('&#x200B;').join('').trim()).trim();
  return {
    id: story.id,
    title: story.title,
    content: newContent,
    subreddit: story.subreddit,
  };
}
function isComplete(postId: string) {
  return Object.keys(trackingObj).includes('done') && trackingObj['done'].includes(postId);
}

export class RedditUtil {
  r: Snoowrap;
  config: ReturnType<typeof validateConfig>;
  constructor(config: ReturnType<typeof validateConfig>) {
    this.config = config;
    this.r = new Snoowrap({
      userAgent: config.story.reddit_user_agent || 'nodejs-tiktok-video-maker',
      clientId: config.story.reddit_client_id,
      clientSecret: config.story.reddit_client_secret,
      refreshToken: config.story.reddit_refresh_token,
      username: config.story.reddit_username,
      password: config.story.reddit_password,
    });
  }
  static markComplete(postId: string) {
    if (!Object.keys(trackingObj).includes('done')) {
      trackingObj['done'] = [];
    }
    if (!trackingObj['done'].includes(postId)) {
      trackingObj['done'].push(postId);
      writeFileSync(trackingFile, JSON.stringify(trackingObj, null, '\t'));
    }
  }
  async getRandom() {
    const subreddits = this.config.story.reddit_random_subreddits;
    const allHotItems = [];
    for (const time of ['hour', 'day', 'week', 'month', 'year', 'all']) {
      for (const subreddit of subreddits) {
        const subredditHotItems = await this.r.getTop(subreddit, {
          time: time as 'hour' | 'day' | 'week' | 'month' | 'year' | 'all',
          limit: this.config.story.reddit_random_limit || 50,
        });
        const filteredHotItems = subredditHotItems.filter((s) => {
          const noMarkdownSelfText = removeMarkdown(s.selftext);
          return (
            s.is_self &&
                        !isComplete(s.id) &&
                        !s.stickied &&
                        !s.is_video &&
                        s.num_comments >= (this.config.story.reddit_random_min_comments || 0) &&
                        (!s.over_18 || this.config.story.reddit_random_allow_nsfw) &&
                        noMarkdownSelfText.length >= (this.config.story.reddit_random_min_length || 0) &&
                        noMarkdownSelfText.length <= (this.config.story.reddit_random_max_length || Number.MAX_SAFE_INTEGER)
          );
        });
        allHotItems.push(...filteredHotItems);
      }
      if (allHotItems.length > 0) {
        const randomHotItem = allHotItems[randomInt(0, allHotItems.length)];
        return fixStory({
          id: randomHotItem.id,
          content: removeMarkdown(randomHotItem.selftext).trim(),
          title: randomHotItem.title,
          subreddit: randomHotItem.subreddit.display_name,
        });
      }
    }
    // This error most likely occurs only when you have posted all the top config.story.random_limit or 50 from all time options
    // This could also occur if the subreddit is empty or doesn't have any valid posts
    throw new Error('Unable to get a random story... Please try increasing the config `random_limit`.');
  }

  async getPostInfo(submissionID: string) {
    const result = this.r.getSubmission(submissionID);
    const [id, content, title, subreddit] = await Promise.all([
      result.id,
      result.selftext,
      result.title,
      result.subreddit.display_name,
    ]);

    return fixStory({
      id,
      content,
      title,
      subreddit,
    });
  }
}
