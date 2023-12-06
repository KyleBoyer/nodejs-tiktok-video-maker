import { join } from 'path';
import { createWriteStream, unlinkSync } from 'fs';
import ytdl from 'ytdl-core';

import { existsAndHasContent } from './fs';
import { ffmpeg, runAutoProgress } from './ffmpeg';
import { MultiProgress } from './multi-progress';

export async function download(url: string, toDir: string, MultiProgressBar: MultiProgress = undefined) {
  const urlInfo = await ytdl.getInfo(url);
  const urlID = urlInfo.videoDetails.videoId;
  const urlFile = join(toDir, `${urlID}.mp4`);
  if (existsAndHasContent(urlFile)) {
    return urlFile;
  }
  const audioDownloadStream = ytdl(url, { quality: 'highestaudio' });
  const pipeAudioStream = audioDownloadStream.pipe(
      createWriteStream(`${urlFile}.audio.tmp`)
  );
    // const tracker = {
    //     audio: { downloaded: 0, total: 0},
    //     video: { downloaded: 0, total: 0},
    // };
  if (MultiProgressBar) {
    const audioBar = MultiProgressBar.newDefaultBarWithLabel('⬇️ Downloading YouTube audio...');
    audioBar.update(0);
    audioDownloadStream.on('progress', (_, downloaded, total) => {
      audioBar.update(downloaded / total);
    });
  }
  const videoDownloadStream = ytdl(url, { quality: 'highestvideo' });
  const pipeVideoStream = videoDownloadStream.pipe(
      createWriteStream(`${urlFile}.video.tmp`)
  );
  if (MultiProgressBar) {
    const videoBar = MultiProgressBar.newDefaultBarWithLabel('⬇️ Downloading YouTube video...');
    videoBar.update(0);
    videoDownloadStream.on('progress', (_, downloaded, total) => {
      videoBar.update(downloaded / total);
    });
  }
  const audioPromise = new Promise((resolve, reject) => {
    pipeAudioStream.on('finish', resolve);
    pipeAudioStream.on('error', reject);
  });
  const videoPromise = new Promise((resolve, reject) => {
    pipeVideoStream.on('finish', resolve);
    pipeVideoStream.on('error', reject);
  });
  await Promise.all([audioPromise, videoPromise]);
  await runAutoProgress(
      ffmpeg()
          .input(`${urlFile}.video.tmp`)
          .input(`${urlFile}.audio.tmp`)
          .withAudioCodec('copy')
          .withVideoCodec('copy')
          .withOutputOptions(['-map 0:v', '-map 1:a'])
          .output(urlFile),
      MultiProgressBar,
      '🎥 Rendering Youtube video...'
  );
  unlinkSync(`${urlFile}.video.tmp`);
  unlinkSync(`${urlFile}.audio.tmp`);
  return urlFile;
}
