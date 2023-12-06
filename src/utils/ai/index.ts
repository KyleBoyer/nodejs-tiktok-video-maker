import { validateConfig } from '../config';
import { MultiProgress } from '../multi-progress';
import { OpenAIUtil } from './openai';


type AIClass = {
  rewordStory: (originalStory: string, MultiProgressBar: MultiProgress) => Promise<string>
  generateNewStory: (MultiProgressBar: MultiProgress) => Promise<{
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

  async rewordStory(originalStory: string, MultiProgressBar: MultiProgress): Promise<string> {
    return this.aiModules[this.config.story.ai_type].rewordStory(originalStory, MultiProgressBar);
  }
  async generateNewStory(MultiProgressBar: MultiProgress): Promise<{
    content: string
    title: string
  }> {
    return this.aiModules[this.config.story.ai_type].generateNewStory(MultiProgressBar);
  }
}
