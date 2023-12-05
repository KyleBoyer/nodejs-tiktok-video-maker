/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-unused-vars */
import { validateConfig } from '../config';
import * as splitter from '../splitter';

export class OpenAIUtil {
  config: ReturnType<typeof validateConfig>;
  constructor(config: ReturnType<typeof validateConfig>) {
    this.config = config;
    const openaiKey = config.story.openai_api_key;
  }

  async rewordStory(originalStory: string): Promise<string> {
    // TODO
    return originalStory;
  }
  async generateNewStory(): Promise<{
    content: string
    title: string
  }> {
    const prompt = this.config.story.prompt;
    // TODO
    return {
      title: 'Not implemented',
      content: 'This function is not implemented yet',
    };
  }
}

