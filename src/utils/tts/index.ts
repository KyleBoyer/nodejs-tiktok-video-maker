import { TikTokTTS, voices as TikTokTTSVoices } from './tiktok';
import { GoogleTranslateTTS, voices as GoogleTranslateTTSVoices } from './google-translate';
import { OpenAITTS, voices as OpenAITTSVoices } from './openai';
import { MultiProgress } from '../multi-progress';
import { validateConfig } from '../config';
import emojiRegex from 'emoji-regex';

type TTSClass = {
  generate: (text: string, MultiProgressBar: MultiProgress) => Promise<Buffer>
}

const removeEmojis = (str: string) => str.split(emojiRegex()).join(''); // Possibly implement per TTS, as some might support speaking emojis - but do we really want that?

export class TTSUtil {
  ttsModules: Record<string, TTSClass>;
  config: ReturnType<typeof validateConfig>;
  constructor(config: ReturnType<typeof validateConfig>) {
    this.config = config;
    this.ttsModules = {
      'tiktok': new TikTokTTS(config),
      'google-translate': new GoogleTranslateTTS(config),
      'openai': new OpenAITTS(config),
    };
  }
  async generate(text: string, MultiProgressBar: MultiProgress): Promise<Buffer> {
    return this.ttsModules[this.config.tts.source].generate(removeEmojis(text), MultiProgressBar);
  }
}

export const voices: Record<string, string[] | Record<string, string | string[]>> = {
  'tiktok': TikTokTTSVoices,
  'google-translate': GoogleTranslateTTSVoices,
  'openai': OpenAITTSVoices,
};
