import OpenAI from 'openai';
import { validateConfig } from '../config';
import Bottleneck from 'bottleneck';

export class OpenAITTS {
  config: ReturnType<typeof validateConfig>;
  openai: OpenAI;
  limiter: Bottleneck;
  constructor(config: ReturnType<typeof validateConfig>) {
    this.config = config;
    this.openai = new OpenAI({
      apiKey: config.tts.openai_api_key,
      baseURL: config.tts.openai_api_base,
    });
    this.limiter = new Bottleneck({
      minTime: (60 * 1000) / config.tts.openai_tts_rpm, // ms
    });
  }
  async generate(text: string): Promise<Buffer> {
    const mp3 = await this.limiter.schedule(() =>
      this.openai.audio.speech.create({
        model: this.config.tts.openai_model,
        voice: this.config.tts.voice as 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer',
        input: text,
      })
    );
    const buffer = Buffer.from(await mp3.arrayBuffer());
    return buffer;
  }
}

export const voices: string[] = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
