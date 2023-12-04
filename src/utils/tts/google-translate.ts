import { createHash } from 'crypto';
import { writeFileSync, readFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { getAudioBase64 } from 'google-tts-api';

import { ttsDir } from '../dirs';
import { concatFiles } from '../ffmpeg';
import { MultiProgress } from '../multi-progress';

async function callAPI(text: string) {
  try {
    const ttsBase64 = await getAudioBase64(text, {
      lang: 'en',
      slow: false,
      host: 'https://translate.google.com',
      timeout: 10000,
    });
    return Buffer.from(ttsBase64, 'base64');
  } catch (err) {
    throw new Error(
        err?.response?.data?.error ||
            err?.response?.data ||
            err?.message ||
            err
    );
  }
}

export class GoogleTranslateTTS {
  config: any;
  constructor(config: any) {
    this.config = config;
  }
  async generate(text: string, MultiProgressBar: MultiProgress): Promise<Buffer> {
    const hash = createHash('md5').update(text).digest('hex');
    const words = text.split(/\s/);
    const textParts = [];
    let currentPart = words[0];
    for (let i = 1; i < words.length; i++) {
      const testPart = currentPart + ' ' + words[i];
      if (testPart.length > 200) {
        textParts.push(currentPart);
        currentPart = words[i];
      } else {
        currentPart = testPart;
      }
    }
    textParts.push(currentPart);
    const combineParts = [];
    let i = 1;
    for (const part of textParts) {
      const partFile = join(ttsDir, `${hash}-part-${i}.mp3`);
      const partAudio = await callAPI(part);
      writeFileSync(partFile, partAudio);
      combineParts.push(partFile);
      i++;
    }
    const combinedFile = join(ttsDir, `${hash}-combined.mp3`);

    await concatFiles({
      files: combineParts,
      output: combinedFile,
      audio_bitrate: this.config.audio.bitrate,
      demuxer: this.config.tts.demux_concat,
      MultiProgressBar,
      progressLabel: '🎵 Combining TTS parts...',
    });
    for (const combinePart of combineParts) {
      unlinkSync(combinePart);
    }
    const retBuffer = readFileSync(combinedFile);
    unlinkSync(combinedFile);
    return retBuffer;
  }
}

export const voices: string[] = [];
