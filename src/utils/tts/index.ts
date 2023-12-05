import { TikTokTTS, voices as TikTokTTSVoices } from './tiktok';
import { GoogleTranslateTTS, voices as GoogleTranslateTTSVoices } from './google-translate';
import { MultiProgress } from '../multi-progress';
import { validateConfig } from '../config';

type TTSClass = {
  generate: (text: string, MultiProgressBar: MultiProgress) => Promise<Buffer>
}

export class TTSUtil {
  ttsModules: Record<string, TTSClass>;
  config: ReturnType<typeof validateConfig>;
  constructor(config: ReturnType<typeof validateConfig>) {
    this.config = config;
    this.ttsModules = {
      'tiktok': new TikTokTTS(config),
      'google-translate': new GoogleTranslateTTS(config),
    };
  }
  async generate(text: string, MultiProgressBar: MultiProgress): Promise<Buffer> {
    return this.ttsModules[this.config.tts.source].generate(text, MultiProgressBar);
  }
}

export const voices: Record<string, string[] | Record<string, string | string[]>> = {
  'tiktok': TikTokTTSVoices,
  'google-translate': GoogleTranslateTTSVoices,
};
