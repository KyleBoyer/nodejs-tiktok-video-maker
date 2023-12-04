import { OpenAIUtil } from './openai';

export class AIUtil {
  aiModules: Record<string, any>;
  config: any;
  constructor(config: any) {
    this.config = config;
    this.aiModules = {
      'openai': new OpenAIUtil(config),
    };
  }

  async rewordStory(originalStory: string) {
    return this.aiModules[this.config.story.source.ai_type].rewordStory(originalStory);
  }
  async generateNewStory() {
    return this.aiModules[this.config.story.source.ai_type].generateNewStory();
  }
}

