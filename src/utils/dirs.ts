import { join } from 'path';
import { ensureDirs } from './fs';

export const fontsDir = join(process.cwd(), 'fonts');
export const assetDir = join(process.cwd(), 'assets');
export const outputDir = join(assetDir, 'output');
export const youtubeDir = join(assetDir, 'youtube');
export const redditDir = join(assetDir, 'reddit');
export const captionsDir = join(assetDir, 'captions');
export const ttsDir = join(assetDir, 'tts');

ensureDirs([fontsDir, assetDir, outputDir, youtubeDir, redditDir, captionsDir, ttsDir]);
