import { join } from 'path';
import axios from 'axios';

import { MultiProgress } from './multi-progress';
import { createWriteStream } from 'fs';
import { ProgressBar } from './progress';
import { existsAndHasContent } from './fs';

export async function download(url: string, toDir: string, MultiProgressBar: MultiProgress = undefined) {
  const soundId = url.split('/songs/').pop().split('/').shift();
  const infoResponse = await axios.get(`https://api.soundstripe.com/app/songs/${soundId}`);
  const infoResponseJSON = infoResponse.data;
  const mp3URL = infoResponseJSON.included.find((i: {
    attributes: {
      primary: boolean
      file: {
        versions: {
          mp3: {
            url: string
          }
        }
      }
    }
  })=>i.attributes.primary).attributes.file.versions.mp3.url;
  const mp3Filename = join(toDir, mp3URL.split('/').pop().split('?').shift());
  if (existsAndHasContent(mp3Filename)) {
    return mp3Filename;
  }
  const writer = createWriteStream(mp3Filename);
  let pb: ProgressBar;
  if (MultiProgressBar) {
    pb = MultiProgressBar.newDefaultBarWithLabel('⬇️ Downloading Soundstripe audio...');
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
