import { TikTokTTS, voices as TikTokTTSVoices } from './tiktok';
import { GoogleTranslateTTS, voices as GoogleTranslateTTSVoices } from './google-translate';
import { MultiProgress } from '../multi-progress';

export class TTSUtil {
  ttsModules: Record<string, any>;
  config: any;
  constructor(config: any) {
    this.config = config;
    this.ttsModules = {
      'tiktok': new TikTokTTS(config),
      'google-translate': new GoogleTranslateTTS(config),
    };
  }
  async generate(text: string, MultiProgressBar: MultiProgress): Promise<Buffer> {
    return this.ttsModules[this.config.tts.name].generate(text, MultiProgressBar);
  }
}

export const voices: Record<string, any> = {
  'tiktok': TikTokTTSVoices,
  'google-translate': GoogleTranslateTTSVoices,
};
