import { join } from 'path';
import { ensureDirs } from './fs';

export const fontsDir = join(process.cwd(), 'fonts');
export const assetDir = join(process.cwd(), 'assets');
export const outputDir = join(assetDir, 'output');
export const backgroundAudioDir = join(assetDir, 'bg-audio');
export const backgroundVideoDir = join(assetDir, 'bg-video');
export const redditDir = join(assetDir, 'reddit');
export const aiDir = join(assetDir, 'ai');
export const captionsDir = join(assetDir, 'captions');
export const ttsDir = join(assetDir, 'tts');

ensureDirs([fontsDir, assetDir, outputDir, backgroundAudioDir, backgroundVideoDir, redditDir, aiDir, captionsDir, ttsDir]);
