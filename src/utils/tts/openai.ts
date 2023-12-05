import OpenAI from 'openai';
import { validateConfig } from '../config';

export class OpenAITTS {
  config: ReturnType<typeof validateConfig>;
  openai: OpenAI;
  constructor(config: ReturnType<typeof validateConfig>) {
    this.config = config;
    this.openai = new OpenAI({
      apiKey: config.tts.openai_api_key,
      baseURL: config.tts.openai_api_base,
    });
  }
  async generate(text: string): Promise<Buffer> {
    const mp3 = await this.openai.audio.speech.create({
      model: this.config.tts.openai_model,
      voice: this.config.tts.voice.replace(/-hd$/, '') as 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer',
      input: text,
    });
    const buffer = Buffer.from(await mp3.arrayBuffer());
    return buffer;
  }
}

export const voices: string[] = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
