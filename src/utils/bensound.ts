import { join } from 'path';
import axios from 'axios';

import { MultiProgress } from './multi-progress';
import { createWriteStream } from 'fs';
import { ProgressBar } from './progress';
import { existsAndHasContent } from './fs';

export async function download(url: string, toDir: string, MultiProgressBar: MultiProgress = undefined) {
  const infoResponse = await axios.get(url);
  const mp3URL = JSON.parse(infoResponse.data.match(/"url"\s*?:\s*?("[^"]+")/)[1]);
  const mp3Filename = join(toDir, mp3URL.split('/').pop());
  if (existsAndHasContent(mp3Filename)) {
    return mp3Filename;
  }
  const writer = createWriteStream(mp3Filename);
  let pb: ProgressBar;
  if (MultiProgressBar) {
    pb = MultiProgressBar.newDefaultBarWithLabel('⬇️ Downloading Bensound audio...');
    pb.update(0);
  }
  const mp3Response = await axios.get(mp3URL, {
    responseType: 'stream',
    onDownloadProgress: (progressEvent) => {
      const percentCompleted = progressEvent.loaded / progressEvent.total;
      if (pb) {
        pb.update(percentCompleted);
      }
    },
  });
  const pipePromise = new Promise((resolve, reject) => {
    let error: Error;
    writer.on('error', (err) => {
      error = err;
      writer.close();
      reject(err);
    });
    writer.on('close', () => {
      if (!error) {
        resolve(true);
      }
    });
  });
  mp3Response.data.pipe(writer);
  await pipePromise;
  return mp3Filename;
}
