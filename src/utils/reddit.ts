import Snoowrap from 'snoowrap';

import Path from 'path';
import fs from 'fs';
import crypto from 'crypto';

import { markdownToTxt as removeMarkdown } from 'markdown-to-txt';

import { existsAndHasContent } from './fs';
import { redditDir } from './dirs';
const trackingFile = Path.join(redditDir, 'tracking.json');
const trackingObj = existsAndHasContent(trackingFile) ? JSON.parse(fs.readFileSync(trackingFile).toString()) : {};

function fixStory(story: {
    id: string,
    title: string,
    content: string,
    folder: string,
}) {
  const newContent = removeMarkdown(story.content.split('&#x200B;').join('').trim()).trim();
  return {
    id: story.id,
    title: story.title,
    content: newContent,
    folder: story.folder,
  };
}
function isComplete(postId: string) {
  return Object.keys(trackingObj).includes('done') && trackingObj['done'].includes(postId);
}

export class RedditUtil {
  r: Snoowrap;
  config: any;
  constructor(config: any) {
    this.config = config;
    this.r = new Snoowrap({
      userAgent: config.story.source.userAgent || 'RedditVideoMaker-node',
      clientId: config.story.source.client_id,
      clientSecret: config.story.source.client_secret,
      refreshToken: config.story.source.refresh_token,
      username: config.story.source.username,
      password: config.story.source.password,
    });
  }
  static markComplete(postId: string) {
    if (!Object.keys(trackingObj).includes('done')) {
      trackingObj['done'] = [];
    }
    if (!trackingObj['done'].includes(postId)) {
      trackingObj['done'].push(postId);
      fs.writeFileSync(trackingFile, JSON.stringify(trackingObj));
    }
  }
  async getRandom() {
    const subreddits = this.config.story.source.random_subreddits;
    const allHotItems = [];
    for (const time of ['hour', 'day', 'week', 'month', 'year', 'all']) {
      for (const subreddit of subreddits) {
        const subredditHotItems = await this.r.getTop(subreddit, {
          time: time as 'hour' | 'day' | 'week' | 'month' | 'year' | 'all',
          limit: this.config.story.source.random_limit || 50,
        });
        const filteredHotItems = subredditHotItems.filter((s) => {
          const noMarkdownSelfText = removeMarkdown(s.selftext);
          return (
            s.is_self &&
                        !isComplete(s.id) &&
                        !s.stickied &&
                        !s.is_video &&
                        s.num_comments >= (this.config.story.source.random_min_comments || 0) &&
                        (!s.over_18 || this.config.story.source.random_allow_nsfw) &&
                        noMarkdownSelfText.length >= (this.config.story.source.random_min_length || 0) &&
                        noMarkdownSelfText.length <= (this.config.story.source.random_max_length || Number.MAX_SAFE_INTEGER)
          );
        });
        allHotItems.push(...filteredHotItems);
      }
      if (allHotItems.length > 0) {
        const randomHotItem = allHotItems[crypto.randomInt(0, allHotItems.length)];
        return fixStory({
          id: randomHotItem.id,
          content: removeMarkdown(randomHotItem.selftext).trim(),
          title: randomHotItem.title,
          folder: randomHotItem.subreddit.display_name,
        });
      }
    }
    // This error most likely occurs only when you have posted all the top config.story.source.random_limit or 50 from all time options
    // This could also occur if the subreddit is empty or doesnt have any valid posts
    throw new Error('Unable to get a random story... Please try increasing the config `random_limit`.');
  }

  async getPostInfo(submissionID: string) {
    const result = this.r.getSubmission(submissionID);
    const [id, content, title, folder] = await Promise.all([
      result.id,
      result.selftext,
      result.title,
      result.subreddit.display_name,
    ]);

    return fixStory({
      id,
      content,
      title,
      folder,
    });
  }
}
