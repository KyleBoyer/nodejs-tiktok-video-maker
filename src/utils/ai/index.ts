import { validateConfig } from '../config';
import { OpenAIUtil } from './openai';


type AIClass = {
  rewordStory: (originalStory: string) => Promise<string>
  generateNewStory: () => Promise<{
    content: string
    title: string
  }>
}

export class AIUtil {
  aiModules: Record<string, AIClass>;
  config: ReturnType<typeof validateConfig>;
  constructor(config: ReturnType<typeof validateConfig>) {
    this.config = config;
    this.aiModules = {
      'openai': new OpenAIUtil(config),
    };
  }

  async rewordStory(originalStory: string): Promise<string> {
    return this.aiModules[this.config.story.source.ai_type].rewordStory(originalStory);
  }
  async generateNewStory(): Promise<{
    content: string
    title: string
  }> {
    return this.aiModules[this.config.story.source.ai_type].generateNewStory();
  }
}

