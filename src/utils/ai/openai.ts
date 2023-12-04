/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-unused-vars */
import * as splitter from '../splitter';

export class OpenAIUtil {
  config: any;
  constructor(config: any) {
    this.config = config;
    const openaiKey = config.story.source.openai_api_key;
  }

  async rewordStory(originalStory: string) {
    // TODO
    return originalStory;
  }
  async generateNewStory() {
    const prompt = this.config.story.source.prompt;
    // TODO
    return {
      title: 'Not implemented',
      content: 'This function is not implemented yet',
      folder: 'openai',
    };
  }
}

