import Snoowrap from 'snoowrap';
import puppeteer, { ElementHandle } from 'puppeteer';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const similarity = require('sentence-similarity');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const similarityScore = require('similarity-score');


import { join } from 'path';
import { readFileSync, writeFileSync } from 'fs';
import { randomInt } from 'crypto';

import { markdownToTxt as removeMarkdown } from 'markdown-to-txt';

import { existsAndHasContent } from './fs';
import { redditDir } from './dirs';
import { validateConfig } from './config';
import { replace } from './replacer';
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

const sleep = (ms: number) => new Promise((resolve)=>setTimeout(resolve, ms));

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
        if (Array.isArray(this.config.story.reddit_random_ai_similarity) && this.config.story.reddit_random_ai_similarity.length) {
          type SubmissionWithSimilarity = Snoowrap.Submission & {
            similarity_score?: number
          }
          const winkOpts = { f: similarityScore.winklerMetaphone, options: {threshold: 0} };
          let foundScoreGreaterThanZero = false;
          for (let i = 0; i < allHotItems.length; i++) {
            const { score } = similarity(this.config.story.reddit_random_ai_similarity, (allHotItems[i].title + ' ' + allHotItems[i].selftext).split(' '), winkOpts);
            (allHotItems[i] as SubmissionWithSimilarity).similarity_score = score;
            foundScoreGreaterThanZero = foundScoreGreaterThanZero || score > 0;
          }
          if (foundScoreGreaterThanZero) {
            const sortedAllHotItems = allHotItems.sort((a, b) => {
              const aScore = (a as SubmissionWithSimilarity).similarity_score;
              const bScore = (b as SubmissionWithSimilarity).similarity_score;
              return bScore - aScore;
            });
            const mostSimilarItem = sortedAllHotItems[0];
            return fixStory({
              id: mostSimilarItem.id,
              content: removeMarkdown(mostSimilarItem.selftext).trim(),
              title: mostSimilarItem.title,
              subreddit: mostSimilarItem.subreddit.display_name,
            });
          }
        }
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

  async screenshotTitle(submissionID: string): Promise<Buffer> {
    const submission = this.r.getSubmission(submissionID);
    const subredditPart = await submission.subreddit_name_prefixed;
    const submissionURL = `https://reddit.com/${subredditPart}/comments/${submissionID}`;
    const feedSettingsURL = 'https://www.reddit.com/settings/feed';
    const isNSFW = await submission.over_18;
    const theme = this.config.story.reddit_screenshot_title_theme;
    const cookieFile = join(redditDir, `${theme}-theme-cookies.json`);
    const browser = await puppeteer.launch({headless: 'new'});
    browser.defaultBrowserContext().overridePermissions('https://www.reddit.com', ['notifications']);
    const browserPages = await browser.pages();
    const page = browserPages.length ? browserPages[0] : await browser.newPage();
    if (existsAndHasContent(cookieFile)) {
      const existingCookies = JSON.parse(readFileSync(cookieFile).toString());
      await page.setCookie(...existingCookies);
    }
    await page.emulateMediaFeatures([
      {name: 'prefers-color-scheme', value: theme},
    ]);
    // console.log('Logging into Reddit...');
    await page.goto('https://www.reddit.com/login');
    await page.waitForNetworkIdle();
    await page.evaluate(`
      if(document.body.outerText.includes('Welcome back!')) {
        window.location=${JSON.stringify(isNSFW ? feedSettingsURL : submissionURL)};
      }
    `);
    // check for h1 with text Welcome back!
    const isLoggedIn = await Promise.race([
      new Promise((resolve) => page.waitForSelector('#USER_DROPDOWN_ID').then(()=>resolve(true)).catch(() => resolve(false))),
      new Promise((resolve) => page.waitForSelector('[name="username"]').then(()=>resolve(false)).catch(() => resolve(true))),
    ]);
    if (!isLoggedIn) {
      await page.waitForSelector('[name="username"]');
      await page.type('[name="username"]', this.config.story.reddit_username);
      await page.waitForSelector('[name="password"]');
      await page.type('[name="password"]', this.config.story.reddit_password);
      await page.click("button[class$='m-full-width']");
      await page.waitForNetworkIdle();
      // await sleep(5000);
      let loginError;
      try {
        const errorModel = await page.$('.AnimatedForm__errorMessage');
        if (errorModel && await errorModel.isVisible()) {
          const errorModalContent = await page.evaluate((el) => el.textContent, errorModel);
          if (errorModalContent.trim().length > 0) {
            loginError = new Error(`Error taking screenshot of Reddit title: ${errorModalContent.trim()}`);
          }
        }
      // eslint-disable-next-line no-empty
      } catch (err) {}
      if (loginError) {
        throw loginError;
      }
    }
    await page.deleteCookie({ name: 'redesign_optout'});
    if (isNSFW) {
      // console.log('Checking settings due to this being a NSFW post...');
      if (page.url() != feedSettingsURL) {
        await page.goto(feedSettingsURL);
      }
      await page.waitForSelector('[aria-checked]');
      const checkboxes = await page.$$('[aria-checked]');
      const nsfwAllowedCheckbox = checkboxes[0];
      if ((await nsfwAllowedCheckbox.evaluate((el) => el.getAttribute('aria-checked'))).toString() == 'false') {
        await nsfwAllowedCheckbox.click();
        await page.waitForNetworkIdle();
        await sleep(100);
      }
      const blurNsfwCheckbox = checkboxes[1];
      if ((await blurNsfwCheckbox.evaluate((el) => el.getAttribute('aria-checked'))).toString() == 'true') {
        await blurNsfwCheckbox.click();
        await page.waitForNetworkIdle();
        await sleep(100);
      }
    }
    // console.log('Loading post...');
    if (page.url() != submissionURL) {
      await page.goto(submissionURL);
    }
    await page.setViewport({width: this.config.video.width, height: this.config.video.height, deviceScaleFactor: 3});
    await page.waitForSelector('[data-test-id="post-content"]');
    const nsfwApprovalButton = await page.$x('//h3[text()="You must be 18+ to view this community"]/parent::*//button[text()="Yes"]');
    if (Array.isArray(nsfwApprovalButton) && nsfwApprovalButton.length && await nsfwApprovalButton[0].isVisible()) {
      await (nsfwApprovalButton[0] as ElementHandle<Element>).click();
    }
    // SHORTCUT_FOCUSABLE_DIV
    const aboutYouSkipButton = await page.$x("//*[@id='SHORTCUT_FOCUSABLE_DIV']//button[text()='Skip']");
    if (Array.isArray(aboutYouSkipButton) && aboutYouSkipButton.length && await aboutYouSkipButton[0].isVisible()) {
      await (aboutYouSkipButton[0] as ElementHandle<Element>).click();
      await page.waitForNetworkIdle();
    }
    // Removes interest modal
    const interestsModal = await page.$x('//*[@id=\'SHORTCUT_FOCUSABLE_DIV\']//div[text()=\'Interests\']/../../../../../../..');
    if (Array.isArray(interestsModal) && interestsModal.length) {
      await page.evaluate((el) => el.style.display = 'none', interestsModal[0] as ElementHandle<HTMLDivElement>);
    }
    // click settings dropdown
    await page.evaluate(`
      document.querySelector(".header-user-dropdown > button").click()
    `);
    const darkModeButton = await page.$x("//span[text()='Dark Mode']/following-sibling::*");
    if (Array.isArray(darkModeButton) && darkModeButton.length) {
      const isDarkModeOn = (await page.evaluate((el) => el.getAttribute('aria-checked'), darkModeButton[0] as ElementHandle<HTMLButtonElement>)).toString() == 'true';
      if (
        (isDarkModeOn && this.config.story.reddit_screenshot_title_theme == 'light') ||
        (!isDarkModeOn && this.config.story.reddit_screenshot_title_theme == 'dark')
      ) {
        await page.evaluate((el) => el.click(), darkModeButton[0] as ElementHandle<HTMLButtonElement>);
      }
    }
    await page.evaluate(`
      document.querySelector(".header-user-dropdown > button").click()
    `);
    // Replace text in data-adclicklocation="title"
    const titleH1 = await page.$('[data-testid="post-container"] * [data-adclicklocation="title"] * h1');
    const titleH1Content = await page.evaluate((el) => el.outerText, titleH1);
    const updatedContent = await replace(await replace(titleH1Content, this.config.replacements['text-and-audio']), this.config.replacements['text-only']);
    await page.evaluate(`
      document.querySelector('[data-testid="post-container"] * [data-adclicklocation="title"] * h1').outerText = ${JSON.stringify(updatedContent)};
    `);
    await Promise.allSettled([
      page.evaluate(
          "document.querySelector('[data-adclicklocation=\"media\"]').style.display = 'none'"
      ),
      // Removes the notify bell icon
      page.evaluate(
          "document.querySelector('[data-test-id=\"post-content\"] > div > button').style.display='none'"
      ),
      // Removes the # comments/share/... buttons
      page.evaluate(
          "document.querySelector('[data-adclicklocation=\"media\"]').nextElementSibling.style.display='none'"
      ),
      // Removes the # comments/share/... buttons
      new Promise((resolve, reject) => page.$x("//span[text()='share']/../../../..").then((shareBar) => {
        if (Array.isArray(shareBar) && shareBar.length > 0) {
          page.evaluate((el) => el.style.display = 'none', shareBar[0] as ElementHandle<HTMLDivElement>).then(resolve).catch(reject);
        } else {
          resolve(null);
        }
      }).catch(reject)),
      // Makes the title screenshot sized better because alert bell is hidden
      page.evaluate(
          "document.querySelector('[data-adclicklocation=\"media\"]').parentElement.style.width='fit-content'"
      ),
      // Adds spacing around box to display more nicely
      page.evaluate(
          "document.querySelector('[data-test-id=\"post-content\"]').style.padding = '1px 1px 1px 1px'"
      ),
    ]);
    const contentElement = await page.$('[data-test-id="post-content"]');
    const image = await contentElement.screenshot({
      type: 'png',
      omitBackground: true,
    });
    const cookies = await page.cookies();
    writeFileSync(cookieFile, JSON.stringify(cookies));
    await page.close();
    await browser.close();
    return image;
  }
}
