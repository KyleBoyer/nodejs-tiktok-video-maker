import OpenAI from 'openai';
import { validateConfig } from '../config';

export class OpenAITTS {
  config: ReturnType<typeof validateConfig>;
  openai: OpenAI;
  constructor(config: ReturnType<typeof validateConfig>) {
    this.config = config;
    this.openai = new OpenAI({
      apiKey: config.tts.openai_api_key,
    });
  }
  async generate(text: string): Promise<Buffer> {
    const mp3 = await this.openai.audio.speech.create({
      model: this.config.tts.voice.endsWith('-hd') ? 'tts-1-hd' : 'tts-1',
      voice: this.config.tts.voice.replace(/-hd$/, '') as 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer',
      input: text,
    });
    const buffer = Buffer.from(await mp3.arrayBuffer());
    return buffer;
  }
}

const openaiVoices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];

export const voices: string[] = openaiVoices.map((v)=>[v, `${v}-hd`]).flat();
