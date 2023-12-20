import { MultiProgress } from './utils/multi-progress';
const sharedMultiProgress = new MultiProgress();
import { readFileSync, writeFileSync, rmSync } from 'fs';
import { createHash, randomInt } from 'crypto';
import { join } from 'path';
import * as exponential from 'exponential-backoff';
// const exponential = {
//   backOff: (fn: any, opts: any) => fn(opts),
// };
// const backoffSettings = {};
const backoffSettings: Partial<exponential.IBackOffOptions> = {
  jitter: 'full',
  startingDelay: 1000,
  timeMultiple: 3,
};

import * as youtube from './utils/youtube';
import * as bensound from './utils/bensound';
import * as soundstripe from './utils/soundstripe';
import { RedditUtil } from './utils/reddit';
import { AIUtil } from './utils/ai';
import { TTSUtil } from './utils/tts';
import * as splitter from './utils/splitter';
import * as replacer from './utils/replacer';
import { ImageGenerator } from './utils/image';
import { generateValidFilename, existsAndHasContent } from './utils/fs';

import { loadConfig, validateConfig } from './utils/config';

import { backgroundAudioDir, backgroundVideoDir, captionsDir, ttsDir, outputDir, aiDir } from './utils/dirs';
import { runAutoProgress, getDuration, ffmpeg, concatFiles } from './utils/ffmpeg';
const dynamicImport = new Function('specifier', 'return import(specifier)');
const prettyMsPromise = dynamicImport('pretty-ms');

export async function generateVideo(config: ReturnType<typeof validateConfig>) {
  const configHash = createHash('md5').update(JSON.stringify(config)).digest('hex');
  const image = new ImageGenerator(config);
  const reddit = new RedditUtil(config);
  const tts = new TTSUtil(config);
  const ai = new AIUtil(config);
  const { default: prettyMilliseconds } = await prettyMsPromise;
  const videoFile = await exponential.backOff(() => youtube.download(config.video.url, backgroundVideoDir, sharedMultiProgress), backoffSettings);
  let useVideoFile = videoFile;
  if (config.video.speed != 1 || config.video.volume != 1) {
    let ffmpegCmd = ffmpeg()
        .input(useVideoFile)
        .audioFilters([
          ...(config.video.volume != 1 ? [{
            filter: 'volume',
            options: config.video.volume.toString(),
          }] : []),
          ...(config.video.speed != 1 ? [{
            filter: 'atempo',
            options: config.video.speed.toString(),
          }] : []),
        ]);
    if (config.video.speed != 1) {
      ffmpegCmd = ffmpegCmd.videoFilters([
        {
          filter: 'setpts',
          options: `PTS/${config.video.speed}`,
        },
      ]);
    } else {
      ffmpegCmd = ffmpegCmd.withVideoCodec('copy');
    }
    const filenameExtras = [
      ...(config.video.speed != 1 ? [`speed-${config.video.speed}`] : []),
      ...(config.video.volume != 1 ? [`volume-${config.video.volume}`] : []),
    ].join('-');
    const videoSpeedVolumeChangedFile = `${useVideoFile.split('.').slice(0, -1).join('.')}-${filenameExtras}.${useVideoFile.split('.').pop()}`;
    if (!existsAndHasContent(videoSpeedVolumeChangedFile)) {
      const whatGotUpdated = [
        ...(config.video.speed != 1 ? ['speed'] : []),
        ...(config.video.volume != 1 ? ['volume'] : []),
      ].join('/');
      await runAutoProgress(
          ffmpegCmd
              .output(videoSpeedVolumeChangedFile),
          sharedMultiProgress,
          `🎥 Rendering ${whatGotUpdated} updated background video...`
      );
    }
    useVideoFile = videoSpeedVolumeChangedFile;
  }
  const audioFile = await exponential.backOff(() => {
    if (config.audio.url.includes('bensound')) {
      return bensound.download(config.audio.url, backgroundAudioDir, sharedMultiProgress);
    } else if (config.audio.url.includes('soundstripe')) {
      return soundstripe.download(config.audio.url, backgroundAudioDir, sharedMultiProgress);
    } else {
      return youtube.download(config.audio.url, backgroundAudioDir, sharedMultiProgress);
    }
  }, backoffSettings);
  const audioOnlyFile = `${audioFile.split('.').slice(0, -1).join('.')}.mp3`;
  if (!existsAndHasContent(audioOnlyFile)) {
    try {
      await runAutoProgress(
          ffmpeg()
              .input(audioFile)
              .withNoVideo()
              .withAudioCodec('copy')
              .output(audioOnlyFile),
          sharedMultiProgress,
          '🎵 Extracting audio from video...'
      );
    } catch (err) { // not stream-copyable, needs to re-encode
      await runAutoProgress(
          ffmpeg()
              .input(audioFile)
              .withNoVideo()
              .output(audioOnlyFile),
          sharedMultiProgress,
          '🎵 Extracting audio from video...'
      );
    }
  }
  let useAudioFile = audioOnlyFile;
  if (config.audio.speed != 1 || config.audio.volume != 1) {
    const filenameExtras = [
      ...(config.audio.speed != 1 ? [`speed-${config.audio.speed}`] : []),
      ...(config.audio.volume != 1 ? [`volume-${config.audio.volume}`] : []),
    ].join('-');
    const audioSpeedVolumeChangedFile = `${useAudioFile.split('.').slice(0, -1).join('.')}-${filenameExtras}.${useAudioFile.split('.').pop()}`;
    if (!existsAndHasContent(audioSpeedVolumeChangedFile)) {
      const whatGotUpdated = [
        ...(config.audio.speed != 1 ? ['speed'] : []),
        ...(config.audio.volume != 1 ? ['volume'] : []),
      ].join('/');
      await runAutoProgress(
          ffmpeg()
              .input(useAudioFile)
              .audioFilters([
                ...(config.audio.volume != 1 ? [{
                  filter: 'volume',
                  options: config.audio.volume.toString(),
                }] : []),
                ...(config.audio.speed != 1 ? [{
                  filter: 'atempo',
                  options: config.audio.speed.toString(),
                }] : []),
              ])
              .output(audioSpeedVolumeChangedFile),
          sharedMultiProgress,
          `🎵 Rendering ${whatGotUpdated} updated background audio...`
      );
    }
    useAudioFile = audioSpeedVolumeChangedFile;
  }
  let story: {
    title: string,
    content: string,
    subreddit?: string,
    id?: string,
  };
  if (config.story.source == 'reddit') {
    if (config.story.reddit_post_id) {
      story = await reddit.getPostInfo(config.story.reddit_post_id);
    } else if (config.story.reddit_random) {
      story = await reddit.getRandom();
      sharedMultiProgress.terminate();
      console.log(`🎲 Random story title: ${story.title}`);
      console.log(`🎲 Random story link: https://reddit.com/r/${story.subreddit}/comments/${story.id}`);
    } else {
      sharedMultiProgress.terminate();
      console.error('If you are using a story from Reddit, you must either supply a `post_id`, or turn `random` on in the config.');
      process.exit(1);
    }
  } else if (config.story.source == 'ai') {
    story = await ai.generateNewStory(sharedMultiProgress);
  }
  if (config.story.ai_rewrite) {
    story.content = await ai.rewordStory(story.content, sharedMultiProgress);
  }
  story.content = await replacer.replace(story.content, config.replacements['text-and-audio']);
  story.title = await replacer.replace(story.title, config.replacements['text-and-audio']);
  const splits = await splitter.split(story.content.split(/\s+/).join(' '), config.captions.nlp_splitter);
  const pb = sharedMultiProgress.newDefaultBarWithLabel('💬 Generating captions and audio...', { total: (splits.length+1) });
  pb.update(0);
  const generateCaptionAndAudio = async (text: string, overrideImage?: string) => {
    const hash = createHash('md5').update(configHash + text).digest('hex');
    const imageFile = overrideImage || join(captionsDir, `${hash}.png`);
    const ttsFile = join(ttsDir, `${hash}.mp3`);
    const [replacedText, replacedAudio] = await Promise.all([
      replacer.replace(text, config.replacements['text-only']),
      replacer.replace(text, config.replacements['audio-only']),
    ]);
    const imageAlreadyExists = existsAndHasContent(imageFile);
    const ttsFileAlreadyExists = existsAndHasContent(ttsFile);
    const imagePromiseFn = imageAlreadyExists ?
            () => Promise.resolve(Buffer.from([])) :
            () => Promise.resolve(image.fromText(replacedText.split(/\s+/).join(' ')));
    const ttsPromiseFn = ttsFileAlreadyExists ?
            () => Promise.resolve(Buffer.from([])) :
            () => tts.generate(replacedAudio, sharedMultiProgress);
    const [imageContent, ttsContent] = await Promise.all([
      exponential.backOff(imagePromiseFn, backoffSettings),
      exponential.backOff(ttsPromiseFn, backoffSettings),
    ]);
    if (!imageAlreadyExists) {
      writeFileSync(imageFile, imageContent);
    }
    if (!ttsFileAlreadyExists) {
      writeFileSync(ttsFile, ttsContent);
    }
    let audioFile = ttsFile;
    if (config.tts.speed != 1 || config.tts.volume != 1) {
      const filenameExtras = [
        ...(config.tts.speed != 1 ? [`speed-${config.tts.speed}`] : []),
        ...(config.tts.volume != 1 ? [`volume-${config.tts.volume}`] : []),
      ].join('-');
      const ttsSpeedVolumeChangedFile = `${audioFile.split('.').slice(0, -1).join('.')}-${filenameExtras}.${audioFile.split('.').pop()}`;
      if (!existsAndHasContent(ttsSpeedVolumeChangedFile)) {
        await runAutoProgress(
            ffmpeg()
                .input(audioFile)
                .audioFilters([
                  ...(config.tts.volume != 1 ? [{
                    filter: 'volume',
                    options: config.tts.volume.toString(),
                  }] : []),
                  ...(config.tts.speed != 1 ? [{
                    filter: 'atempo',
                    options: config.tts.speed.toString(),
                  }] : []),
                ])
                .withNoVideo()
                .output(ttsSpeedVolumeChangedFile),
            sharedMultiProgress,
            '🎵 Rendering speed/volume updated TTS section...'
        );
      }
      audioFile = ttsSpeedVolumeChangedFile;
    }
    if (config.video.accurate_render_method) {
      const ttsVideoFile = `${audioFile.split('.').slice(0, -1).join('.')}.webm`;
      if (!existsAndHasContent(ttsVideoFile)) {
        await runAutoProgress(
            ffmpeg()
                .input(audioFile)
                .input(imageFile)
                .outputOptions(['-pix_fmt yuva420p'])
                .output(ttsVideoFile),
            sharedMultiProgress,
            '🎵 Rendering TTS section...'
        );
      }
      const ttsDuration = Math.ceil(await getDuration(ttsVideoFile, sharedMultiProgress, true) * 100) / 100;
      return {
        imageFile,
        audioFile,
        ttsDuration,
        videoFile: ttsVideoFile,
      };
    } else {
      const ttsDuration = Math.ceil(await getDuration(audioFile, sharedMultiProgress, true) * 100) / 100;
      return { imageFile, audioFile, ttsDuration };
    }
  };
  let titleImage;
  if (config.story.source == 'reddit' && config.story.reddit_screenshot_title) {
    const titleScreenshotFile = join(captionsDir, `${story.id}-screenshot-${configHash}.png`);
    if (!existsAndHasContent(titleScreenshotFile)) {
      const imageData = await image.resize(await reddit.screenshotTitle(story.id));
      writeFileSync(titleScreenshotFile, imageData);
    }
    titleImage = titleScreenshotFile;
  }
  const titleRenderings = await generateCaptionAndAudio(story.title, titleImage);
  const videoParts = [titleRenderings];
  const silenceAudioFile = join(ttsDir, `silence-${config.tts.extra_silence}-${configHash}.mp3`);
  const silenceVideoFile = join(ttsDir, `silence-${config.tts.extra_silence}-${configHash}.webm`);
  if (config.tts.extra_silence > 0) {
    if (!existsAndHasContent(silenceAudioFile)) {
      await runAutoProgress(
          ffmpeg()
              .input(videoParts[0].audioFile)
              .inputOptions([`-stream_loop ${Math.ceil(config.tts.extra_silence / videoParts[0].ttsDuration)}`])
              .withDuration(config.tts.extra_silence)
              .withNoVideo()
              .withAudioFilters([{
                filter: 'volume',
                options: '0',
              }])
              .output(silenceAudioFile),
          sharedMultiProgress,
          '🎵 Rendering extra silence audio...'
      );
      // await runAutoProgress(
      //     ffmpeg()
      //         .input('anullsrc')
      //         .inputOptions(['-f lavfi'])
      //         .withDuration(config.tts.extra_silence)
      //         .withAudioBitrate(`${config.audio.bitrate}k`)
      //         .output(silenceAudioFile),
      //     sharedMultiProgress,
      //     "🎵 Rendering extra silence audio..."
      // )
    }
    if (config.video.accurate_render_method) {
      const silenceImageFile = join(ttsDir, `blank-${configHash}.png`);
      if (!existsAndHasContent(silenceImageFile)) {
        writeFileSync(silenceImageFile, await image.fromText(' '));
      }
      if (!existsAndHasContent(silenceVideoFile)) {
        await runAutoProgress(
            ffmpeg()
                .input(silenceAudioFile)
                .input(silenceImageFile)
                .outputOptions(['-pix_fmt yuva420p'])
                .output(silenceVideoFile),
            sharedMultiProgress,
            '🎵 Rendering extra silence video...'
        );
      }
    }
  }
  pb.tick(1);
  for (const sentence of splits) {
    const renderings = await generateCaptionAndAudio(sentence);
    videoParts.push(renderings);
    pb.tick(1);
  }
  let finalTTSFile; let finalTTSVideoFile;
  if (config.video.accurate_render_method) {
    const useConcatParts = videoParts.map((p)=>
            config.tts.extra_silence > 0 ?
                [p.videoFile, silenceVideoFile] :
                [p.videoFile]
    ).flat();
    const concatStr = useConcatParts.join('|');
    const hash = createHash('md5').update(configHash + concatStr).digest('hex');
    finalTTSVideoFile = join(ttsDir, `${hash}.webm`);
    if (!existsAndHasContent(finalTTSVideoFile)) {
      await concatFiles({
        files: useConcatParts,
        output: finalTTSVideoFile,
        audio_bitrate: config.audio.bitrate,
        video_bitrate: config.video.bitrate,
        demuxer: config.tts.demux_concat,
        MultiProgressBar: sharedMultiProgress,
        progressLabel: '🎵 Rendering combined TTS...',
      });
    }
  } else {
    const useConcatParts = videoParts.map((p)=>
            config.tts.extra_silence > 0 ?
                [p.audioFile, silenceAudioFile] :
                [p.audioFile]
    ).flat();
    const concatStr = useConcatParts.join('|');
    const hash = createHash('md5').update(configHash + concatStr).digest('hex');
    finalTTSFile = join(ttsDir, `${hash}.mp3`);
    if (!existsAndHasContent(finalTTSFile)) {
      await concatFiles({
        files: useConcatParts,
        output: finalTTSFile,
        audio_bitrate: config.audio.bitrate,
        demuxer: config.tts.demux_concat,
        MultiProgressBar: sharedMultiProgress,
        progressLabel: '🎵 Rendering combined TTS audio...',
      });
    }
  }
  const allDurations = videoParts.map((p)=>p.ttsDuration+config.tts.extra_silence);
  const calculatedTTSDuration = allDurations.reduce((partialSum, a) => partialSum + a, 0);
  // sharedMultiProgress.terminate();
  // console.log('Calculated duration from parts:',calculatedTTSDuration);
  const actualTTSDuration = await getDuration(config.video.accurate_render_method ? finalTTSVideoFile : finalTTSFile, sharedMultiProgress, true, '⏳ Calculating accurate TTS duration...');
  const totalDurationSeconds = config.video.accurate_render_method ? actualTTSDuration : Math.max(calculatedTTSDuration, actualTTSDuration);
  // sharedMultiProgress.terminate();
  // console.log('Actual duration from file:', actualTTSDuration);
  const ttsDurationCorrection = config.video.accurate_render_method ? 0 : ((actualTTSDuration - calculatedTTSDuration) / videoParts.length);
  sharedMultiProgress.terminate();
  console.log(`🎥 Video will be ${prettyMilliseconds(totalDurationSeconds * 1000, {verbose: true})} long!`);
  const useVideoFileDuration = await getDuration(useVideoFile, sharedMultiProgress);
  if (totalDurationSeconds > useVideoFileDuration) {
    if (config.video.loop) {
      const numVideoLoops = Math.ceil(totalDurationSeconds / useVideoFileDuration);
      const videoLoopedFile = `${useVideoFile.split('.').slice(0, -1).join('.')}-looped-${numVideoLoops}.${useVideoFile.split('.').pop()}`;
      if (!existsAndHasContent(videoLoopedFile)) {
        await runAutoProgress(
            ffmpeg()
                .input(useVideoFile)
                .inputOptions([`-stream_loop ${numVideoLoops}`])
                .withVideoCodec('copy')
                .withAudioCodec('copy')
                .output(videoLoopedFile),
            sharedMultiProgress,
            '🎥 Rendering looped background video...'
        );
      }
      useVideoFile = videoLoopedFile;
    } else {
      sharedMultiProgress.terminate();
      console.error('Background video is too short. Please enable looping or choose a different video.');
      process.exit(1);
    }
  }
  const useAudioFileDuration = await getDuration(useAudioFile, sharedMultiProgress);
  if (totalDurationSeconds > useAudioFileDuration) {
    if (config.audio.loop) {
      const numAudioLoops = Math.ceil(totalDurationSeconds / useAudioFileDuration);
      const audioLoopedFile = `${useAudioFile.split('.').slice(0, -1).join('.')}-looped-${numAudioLoops}.${useAudioFile.split('.').pop()}`;
      if (!existsAndHasContent(audioLoopedFile)) {
        await runAutoProgress(
            ffmpeg()
                .input(useAudioFile)
                .inputOptions([`-stream_loop ${numAudioLoops}`])
                .withAudioCodec('copy')
                .output(audioLoopedFile),
            sharedMultiProgress,
            '🎵 Rendering looped background audio...'
        );
      }
      useAudioFile = audioLoopedFile;
    } else {
      sharedMultiProgress.terminate();
      console.error('Background audio is too short. Please enable looping or choose a different audio.');
      process.exit(1);
    }
  }
  let videoStart = null;
  if (config.video.trim_method == 'keep_start') {
    videoStart = 0;
  } else if (config.video.trim_method == 'keep_end') {
    const accurateUseVideoFileDuration = await getDuration(useVideoFile, sharedMultiProgress, true, '⏳ Calculating accurate background video duration...');
    videoStart = accurateUseVideoFileDuration - totalDurationSeconds;
  } else { // random
    const accurateUseVideoFileDuration = await getDuration(useVideoFile, sharedMultiProgress, true, '⏳ Calculating accurate background video duration...');
    const precision = 1000000;
    const extraVideoDuration = Math.floor((accurateUseVideoFileDuration - totalDurationSeconds)*precision);
    videoStart = randomInt(0, extraVideoDuration+1) / precision; // +1 because the ending is exclusive
  }
  let audioStart = null;
  if (config.audio.trim_method == 'keep_start') {
    audioStart = 0;
  } else if (config.audio.trim_method == 'keep_end') {
    const accurateUseAudioFileDuration = await getDuration(useAudioFile, sharedMultiProgress, true, '⏳ Calculating accurate background audio duration...');
    audioStart = accurateUseAudioFileDuration - totalDurationSeconds;
  } else { // random
    const accurateUseAudioFileDuration = await getDuration(useAudioFile, sharedMultiProgress, true, '⏳ Calculating accurate background audio duration...');
    const precision = 1000000;
    const extraAudioDuration = Math.floor((accurateUseAudioFileDuration - totalDurationSeconds)*precision);
    audioStart = randomInt(0, extraAudioDuration+1) / precision; // +1 because the ending is exclusive
  }
  const finalVideoExtension = '.' + config.video.output_format;
  const finalVideoFile = join(outputDir, generateValidFilename(story.title, 256 - finalVideoExtension.length) + finalVideoExtension);
  const finalVideoFilters: string | ffmpeg.FilterSpecification | (string | ffmpeg.FilterSpecification)[] = [{
    filter: 'amix', options: { inputs: 3 },
  }];
  if (config.video.resize_method == 'crop') {
    const cropFilterX = {
      left: '0',
      center: '(in_w-out_w)/2',
      right: '(in_w-out_w)',
    }[config.video.crop_style_width];
    const cropFilterY = {
      top: '0',
      center: '(in_h-out_h)/2',
      bottom: '(in_h-out_h)',
    }[config.video.crop_style_height];
    const cropWidth = config.video.height > config.video.width ?
            `ih*(${config.video.width}/${config.video.height})` :
            'iw';
    const cropHeight = config.video.height < config.video.width ?
            `iw*(${config.video.height}/${config.video.width})` :
            'ih';
    finalVideoFilters.push({ filter: 'crop', inputs: '[1:v]', outputs: 'tmp', options: [cropWidth, cropHeight, cropFilterX, cropFilterY].join(':')});
  } else {
    if (config.video.scale_pad) {
      const aspect = config.video.width / config.video.height;
      finalVideoFilters.push({
        filter: 'scale',
        inputs: '[1:v]', outputs: 'tmp',
        options: {
          w: 'if(gt(a,' + aspect + '),' + config.video.width + ',trunc(' + config.video.height + '*a/2)*2)',
          h: 'if(lt(a,' + aspect + '),' + config.video.height + ',trunc(' + config.video.width + '/a/2)*2)',
        },
      });
      finalVideoFilters.push({
        filter: 'pad',
        inputs: '[tmp]', outputs: 'tmp',
        options: {
          w: config.video.width,
          h: config.video.height,
          x: 'if(gt(a,' + aspect + '),0,(' + config.video.width + '-iw)/2)',
          y: 'if(lt(a,' + aspect + '),0,(' + config.video.height + '-ih)/2)',
          color: config.video.scale_pad_color,
        },
      });
    } else {
      finalVideoFilters.push({ filter: 'scale', inputs: '[1:v]', outputs: 'tmp', options: `${config.video.width}:${config.video.height},setsar=1` });
    }
  }
  let finalVideoCmd = ffmpeg({ stdoutLines: 0}).input(config.video.accurate_render_method ? finalTTSVideoFile : finalTTSFile); // 0
  // This is a hack to render the vcodec flag in the right spot of the ffmpeg cmd, it is used twice, after the second and third inputs
  // This took quite some testing to figure out, but was the cause of a bug with a black screen
  if (config.video.accurate_render_method) {
    finalVideoCmd = finalVideoCmd.inputOptions(['-vcodec libvpx-vp9']);
  }
  finalVideoCmd = finalVideoCmd.input(useVideoFile).seekInput(videoStart); // 1
  // if(config.video.accurate_render_method){
  //     finalVideoCmd = finalVideoCmd.inputOptions(['-vcodec libvpx-vp9']);
  // }
  finalVideoCmd=finalVideoCmd.input(useAudioFile).seekInput(audioStart); // 2
  if (config.video.accurate_render_method) {
    finalVideoCmd = finalVideoCmd.inputOptions(['-vcodec libvpx-vp9']);
  }
  finalVideoCmd=finalVideoCmd.withDuration(totalDurationSeconds);
  const overlayFilters: string | ffmpeg.FilterSpecification | (string | ffmpeg.FilterSpecification)[] = [];
  if (config.video.accurate_render_method) {
    // finalVideoCmd = finalVideoCmd.outputOptions(['-pix_fmt yuva420p']).withVideoCodec('libvpx-vp9')
    overlayFilters.push({
      filter: 'setpts', options: 'PTS-STARTPTS', inputs: '[0:v]', outputs: 'pts-fixed-tts',
    });
    overlayFilters.push({
      filter: 'scale2ref',
      inputs: '[pts-fixed-tts][tmp]',
      outputs: '[scaled-tts][tmp]', // possible change tmp to throwaway
      options: {
        w: 'iw',
        h: 'ih',
      },
    });
    overlayFilters.push({
      filter: 'overlay',
      inputs: '[tmp][scaled-tts]',
      outputs: 'tmp',
      options: {
        x: '(main_w-overlay_w)/2',
        y: '(main_h-overlay_h)/2',
      },
    });
  } else {
    let currentTime = 0;
    let inputIndex = 2;
    for (const videoPart of videoParts) {
      const ttsDuration = videoPart.ttsDuration + (config.video.autocorrect_tts_duration ? ttsDurationCorrection : 0);
      finalVideoCmd = finalVideoCmd.input(videoPart.imageFile);
      inputIndex++;
      overlayFilters.push({
        filter: 'scale2ref',
        inputs: `[${inputIndex}:v][tmp]`,
        outputs: `[scaled-input-${inputIndex}][tmp]`,
        options: {
          w: 'iw',
          h: 'ih',
        },
      });
      overlayFilters.push({
        filter: 'overlay',
        inputs: `[tmp][scaled-input-${inputIndex}]`,
        outputs: 'tmp',
        options: {
          x: '(main_w-overlay_w)/2',
          y: '(main_h-overlay_h)/2',
          enable: `between(t,${currentTime},${currentTime + ttsDuration})`,
        },
      });
      currentTime = currentTime + ttsDuration + config.tts.extra_silence;
    }
  }
  await runAutoProgress(
      finalVideoCmd
          .complexFilter([...finalVideoFilters, ...overlayFilters], 'tmp')
          .withAudioBitrate(`${config.audio.bitrate}k`)
          .withVideoBitrate(config.video.bitrate) // k is automatically appended here
          .output(finalVideoFile),
      sharedMultiProgress,
      '🎥 Rendering final video...'
  );
  sharedMultiProgress.terminate();
  if (config.story.source == 'reddit') {
    RedditUtil.markComplete(story.id);
  } else if (config.story.source == 'ai') {
    const aiTrackingFile = join(aiDir, `${generateValidFilename(config.story.ai_type)}.json`);
    let newJson;
    try {
      if (existsAndHasContent(aiTrackingFile)) {
        const parsedAITrackingFile = JSON.parse(readFileSync(aiTrackingFile).toString());
        if (Array.isArray(parsedAITrackingFile)) {
          newJson = parsedAITrackingFile;
        } else {
          newJson = [parsedAITrackingFile];
        }
      }
    } catch (err) {
      newJson = [];
    }
    newJson.push({ epoch: (new Date()).valueOf(), prompt: config.story.openai_new_story_prompt, title: story.title, content: story.content });
    writeFileSync(aiTrackingFile, JSON.stringify(newJson, null, '\t'));
  }
  if (config.cleanup.background_audio) {
    rmSync(backgroundAudioDir, { recursive: true, force: true });
  }
  if (config.cleanup.background_video) {
    rmSync(backgroundVideoDir, { recursive: true, force: true });
  }
  if (config.cleanup.tts) {
    rmSync(ttsDir, { recursive: true, force: true });
  }
  if (config.cleanup.captions) {
    rmSync(captionsDir, { recursive: true, force: true });
  }
  sharedMultiProgress.terminate();
  console.log(`Video has been output to: ${finalVideoFile}`);
}
if (require.main === module) {
  generateVideo(loadConfig());
}
