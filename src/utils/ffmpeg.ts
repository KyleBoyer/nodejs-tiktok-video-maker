import { cpus } from 'os';
import { readFileSync, unlinkSync, copyFileSync, writeFileSync } from 'fs';
import { fileSync } from 'tmp';
import ffmpeg from 'fluent-ffmpeg';
import { MultiProgress } from './multi-progress';
import { ProgressBar } from './progress';

export function runAutoProgress(ffmpegCmd: ffmpeg.FfmpegCommand, MultiProgressBar: MultiProgress, label='🎥 Rendering...', appearAfter=1500) {
  let bar: ProgressBar;
  let preBarProgress = 0;
  return new Promise((resolve, reject) => {
    let cmd: string;
    const barStartTimer = setTimeout(() => {
      bar = MultiProgressBar.newDefaultBarWithLabel(label);
      bar.update(preBarProgress);
    }, appearAfter);
    ffmpegCmd
        .outputOptions([`-threads ${cpus().length}`, '-y'])
        .on('progress', (progress) => {
          const progressDecimal = progress.percent / 100;
          if (bar) {
            bar.update(progressDecimal);
          } else {
            preBarProgress = progressDecimal;
          }
        })
        .on('start', (ffmpegCLICommand) => {
          cmd = ffmpegCLICommand;
        })
        .on('error', (err) => {
          clearTimeout(barStartTimer);
          reject(err);
        })
        .on('end', (stdout, stderr) => {
          clearTimeout(barStartTimer);
          if (bar) {
            bar.update(100);
          }
          resolve({ stdout, stderr, cmd }); // setImmediate gives the progress bar time to finish rendering
        })
        .run();
  });
}

export async function getDuration(file: string, MultiProgressBar: MultiProgress, accurate=false, progressLabel='⏳ Calculating duration...', appearAfter=1500): Promise<number> { // Accurate=true takes much longer
  if (accurate) {
    let bar: ProgressBar;
    let preBarProgress = 0;
    const decodeResult = await new Promise<number>((resolve, reject) => {
      const progressFile = fileSync().name;
      const barStartTimer = setTimeout(() => {
        bar = MultiProgressBar.newDefaultBarWithLabel(progressLabel);
        bar.update(preBarProgress);
      }, appearAfter);
      ffmpeg({ stdoutLines: 0 })
          .input(file)
          .outputOptions(['-f null', `-progress ${progressFile}`, `-threads ${cpus().length}`])
          .output('/dev/null')
          .on('error', (err) => {
            clearTimeout(barStartTimer);
            reject(err);
          })
          .on('progress', (progress) => {
            const progressDecimal = progress.percent / 100;
            if (bar) {
              bar.update(progressDecimal);
            } else {
              preBarProgress = progressDecimal;
            }
          })
          .on('end', () => {
            clearTimeout(barStartTimer);
            if (bar) {
              bar.update(100);
            }
            const progressLines = readFileSync(progressFile).toString().split('\n').filter((l)=>l.includes('out_time_ms'));
            unlinkSync(progressFile);
            if (progressLines.length) {
              const lastOutMS = progressLines.pop();
              const ms = +lastOutMS.split('=').pop().trim();
              resolve(ms / 1000000);
            } else {
              resolve(null);
            }
          })
          .run();
    });
    if (decodeResult) {
      return decodeResult;
    }
  }
  const probeData: ffmpeg.FfprobeData = await new Promise((resolve, reject) =>
    ffmpeg.ffprobe(file, (err, metadata) => {
      if (err) {
        reject(err);
      } else {
        resolve(metadata);
      }
    })
  );
  return probeData['format']['duration'];
}

export async function concatFiles(options: {
  files: string[],
  output: string,
  audio_bitrate?: number,
  video_bitrate?: number,
  MultiProgressBar: MultiProgress,
  progressLabel: string,
  demuxer: boolean
}) {
  const files = options.files;
  if (!Array.isArray(files) || files.length <= 0) {
    throw new Error('An input file list is required!');
  }
  const outFile = options.output;
  if (!outFile) {
    throw new Error('An output file is required!');
  }
  if (files.length == 1) {
    copyFileSync(files[0], outFile);
    return { cmd: `cp '${files[0]}' '${outFile}'`, stderr: '', stdout: '' };
  }
  const audioBitrate = options.audio_bitrate;
  const videoBitrate = options.video_bitrate;
  const MultiProgressBar = options.MultiProgressBar;
  const progressLabel = options.progressLabel;
  const demuxer = options.demuxer ?? true;
  const runCmd = (cmd: ffmpeg.FfmpegCommand) => runAutoProgress(cmd, MultiProgressBar, progressLabel);
  if (demuxer) {
    const fileListingFile = `${outFile}.txt`;
    writeFileSync(fileListingFile, files.map((f)=>`file '${f}'\n`).join(''));
    let ffmpegCmd = ffmpeg({ stdoutLines: 0 })
        .input(fileListingFile)
        .inputOptions(['-f concat', '-safe 0']);
    if (audioBitrate) {
      ffmpegCmd = ffmpegCmd.withAudioBitrate(audioBitrate);
    }
    if (videoBitrate) {
      ffmpegCmd = ffmpegCmd.withVideoBitrate(videoBitrate);
    }
    ffmpegCmd = ffmpegCmd
        .outputOptions(['-c copy'])
        .output(outFile);
    const output = await runCmd(ffmpegCmd);
    unlinkSync(fileListingFile);
    return output;
  } else {
    const concatInputStr = `concat:${files.join('|')}`;
    let ffmpegCmd = ffmpeg({ stdoutLines: 0 }).input(concatInputStr);
    if (audioBitrate) {
      ffmpegCmd = ffmpegCmd.withAudioBitrate(audioBitrate);
    }
    if (videoBitrate) {
      ffmpegCmd = ffmpegCmd.withVideoBitrate(videoBitrate);
    }
    ffmpegCmd = ffmpegCmd
        .outputOptions(['-c copy'])
        .output(outFile);
    const output = await runCmd(ffmpegCmd);
    return output;
  }
}

export { ffmpeg };
