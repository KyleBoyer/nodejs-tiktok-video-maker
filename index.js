const MultiProgress = require('./utils/multi-progress');
global.ProgressBar = new MultiProgress();
const fs = require('fs');
const crypto = require('crypto');
const Path = require('path');
const exponential = 
    { backOff: func => func() };
    // require('exponential-backoff');
const backoffSettings = {
    jitter: 'full',
    startingDelay: 1000,
    timeMultiple: 3
}

const youtube = require('./utils/youtube');
const RedditUtil = require('./utils/reddit');
const AIUtil = require('./utils/ai');
const { TTSUtil } = require('./utils/tts');
const splitter = require('./utils/splitter');
const replacer = require('./utils/replacer');
const ImageGenerator = require('./utils/image');
const { generateValidFilename, existsAndHasContent } = require('./utils/fs')

const { loadConfig } = require('./utils/config');
const config = loadConfig();
const image = new ImageGenerator(config);
const reddit = new RedditUtil(config);
const tts = new TTSUtil(config);
const ai = new AIUtil(config);

const { youtubeDir, captionsDir, ttsDir, outputDir } = require('./utils/dirs');
const { runWithoutProgress, runWithProgress, getDuration, ffmpeg, concatFiles } = require('./utils/ffmpeg');
const prettyMsPromise = import('pretty-ms');

async function main() {
    const { default: prettyMilliseconds } = await prettyMsPromise;
    const videoFile = await exponential.backOff(() => youtube.download(config.video.url, youtubeDir), backoffSettings);
    let useVideoFile = videoFile;
    if(config.video.speed != 1 || config.video.volume != 1){
        let ffmpegCmd = ffmpeg()
            .input(useVideoFile)
            .audioFilters([
                ...(config.video.volume != 1 ? [{
                        filter: 'volume',
                        options: config.video.volume.toString()
                }] : []),
                ...(config.video.speed != 1 ? [{
                        filter: 'atempo',
                        options: config.video.speed.toString()
                }] : []),
            ]);
        if(config.video.speed != 1){
            ffmpegCmd = ffmpegCmd.videoFilters([
                {
                    filter: 'setpts',
                    options: `PTS/${config.video.speed}`
                }
            ])
        }else{
            ffmpegCmd = ffmpegCmd.withVideoCodec('copy')
        }
        const filenameExtras = [
            ...(config.video.speed != 1 ? [`speed-${config.video.speed}`] : []),
            ...(config.video.volume != 1 ? [`volume-${config.video.volume}`] : []),
        ].join('-');
        const videoSpeedVolumeChangedFile = `${useVideoFile.split('.').slice(0, -1).join('.')}-${filenameExtras}.${useVideoFile.split('.').pop()}`;
        if(!existsAndHasContent(videoSpeedVolumeChangedFile)){
            const whatGotUpdated = [
                ...(config.video.speed != 1 ? [`speed`] : []),
                ...(config.video.volume != 1 ? [`volume`] : []),
            ].join('/');
            await runWithProgress(
                ffmpegCmd
                    .output(videoSpeedVolumeChangedFile),
                    `🎥 Rendering ${whatGotUpdated} updated background video...`
            )
        }
        useVideoFile = videoSpeedVolumeChangedFile;
    }
    const audioFile = await exponential.backOff(() => youtube.download(config.audio.url, youtubeDir), backoffSettings);
    const audioOnlyFile = `${audioFile.split('.').slice(0, -1).join('.')}.mp3`;
    if(!existsAndHasContent(audioOnlyFile)){
        await runWithProgress(
            ffmpeg()
                .input(audioFile)
                .withNoVideo()
                // .withAudioCodec('copy')
                .output(audioOnlyFile),
                '🎵 Extracting audio from video...'
        )
    }
    let useAudioFile = audioOnlyFile;
    if(config.audio.speed != 1 || config.audio.volume != 1){
        const filenameExtras = [
            ...(config.audio.speed != 1 ? [`speed-${config.audio.speed}`] : []),
            ...(config.audio.volume != 1 ? [`volume-${config.audio.volume}`] : []),
        ].join('-');
        const audioSpeedVolumeChangedFile = `${useAudioFile.split('.').slice(0, -1).join('.')}-${filenameExtras}.${useAudioFile.split('.').pop()}`;
        if(!existsAndHasContent(audioSpeedVolumeChangedFile)){
            const whatGotUpdated = [
                ...(config.audio.speed != 1 ? [`speed`] : []),
                ...(config.audio.volume != 1 ? [`volume`] : []),
            ].join('/');
            await runWithProgress(
                ffmpeg()
                    .input(useAudioFile)
                    .audioFilters([
                        ...(config.audio.volume != 1 ? [{
                                filter: 'volume',
                                options: config.audio.volume.toString()
                        }] : []),
                        ...(config.audio.speed != 1 ? [{
                                filter: 'atempo',
                                options: config.audio.speed.toString()
                        }] : []),
                    ])
                    .output(audioSpeedVolumeChangedFile),
                    `🎵 Rendering ${whatGotUpdated} updated background audio...`
            )
        }
        useAudioFile = audioSpeedVolumeChangedFile;
    }
    let story = {};
    if(config.story.source.name == 'reddit'){
        if(config.story.source.post_id){
            story = await reddit.getPostInfo(config.story.source.post_id);
        } else if(config.story.source.random){
            story = await reddit.getRandom();
            global.ProgressBar.terminate();
            console.log(`🎲 Random story title: ${story.title}`)
            console.log(`🎲 Random story link: https://reddit.com/r/${story.folder}/comments/${story.id}`)
        } else {
            global.ProgressBar.terminate();
            console.error("If you are using a story from Reddit, you must either supply a `post_id`, or turn `random` on in the config.");
            process.exit(1);
        }
    } else if (config.story.source.name == 'ai'){
        story = await ai.generateNewStory(config.story.source.prompt);
    }
    if(config.story.source.ai_rewrite){
        story.content = await ai.rewordStory(story.content);
    }
    story.content = await replacer.replace(story.content, config.replacements['text-and-audio']);
    story.title = await replacer.replace(story.title, config.replacements['text-and-audio']);
    const splits = await splitter.split(story.content.replace('\n', ' '), config.captions.nlp_splitter);
    const pb = global.ProgressBar.newDefaultBarWithLabel('💬 Generating captions and audio...', { total: (splits.length+1) });
    const generateCaptionAndAudio = async (text) => {
        const hash = crypto.createHash('md5').update(text).digest("hex");
        const imageFile = Path.join(captionsDir, `${hash}.png`);
        const ttsFile = Path.join(ttsDir, `${hash}.mp3`);
        const [ replacedText, replacedAudio ] = await Promise.all([
            replacer.replace(text, config.replacements['text-only']),
            replacer.replace(text, config.replacements['audio-only'])
        ]);
        const imageAlreadyExists = existsAndHasContent(imageFile);
        const ttsFileAlreadyExists = existsAndHasContent(ttsFile);
        const imagePromiseFn = imageAlreadyExists ?
            () => Promise.resolve() :
            () => image.fromText(replacedText.split('\n').join(' '));
        const ttsPromiseFn = ttsFileAlreadyExists ?
            () => Promise.resolve() :
            () => tts.generate(replacedAudio);
        const [ imageContent, ttsContent ] = await Promise.all([
            exponential.backOff(imagePromiseFn, backoffSettings),
            exponential.backOff(ttsPromiseFn, backoffSettings),
        ])
        if(!imageAlreadyExists){
            fs.writeFileSync(imageFile, imageContent);
        }
        if(!ttsFileAlreadyExists){
            fs.writeFileSync(ttsFile, ttsContent);
        }
        let audioFile = ttsFile;
        if(config.tts.speed != 1 || config.tts.volume != 1){
            const filenameExtras = [
                ...(config.tts.speed != 1 ? [`speed-${config.tts.speed}`] : []),
                ...(config.tts.volume != 1 ? [`volume-${config.tts.volume}`] : []),
            ].join('-');
            const ttsSpeedVolumeChangedFile = `${audioFile.split('.').slice(0, -1).join('.')}-${filenameExtras}.${audioFile.split('.').pop()}`;
            if(!existsAndHasContent(ttsSpeedVolumeChangedFile)){
                await runWithoutProgress(
                    ffmpeg()
                        .input(audioFile)
                        .audioFilters([
                            ...(config.tts.volume != 1 ? [{
                                    filter: 'volume',
                                    options: config.tts.volume.toString()
                            }] : []),
                            ...(config.tts.speed != 1 ? [{
                                    filter: 'atempo',
                                    options: config.tts.speed.toString()
                            }] : []),
                        ])
                        .withNoVideo()
                        .output(ttsSpeedVolumeChangedFile)
                )
            }
            audioFile = ttsSpeedVolumeChangedFile;
        }
        if(config.video.accurate_render_method){
            const ttsVideoFile = `${audioFile.split('.').slice(0, -1).join('.')}.webm`;
            if(!existsAndHasContent(ttsVideoFile)){
                await runWithoutProgress(
                    ffmpeg()
                        .input(audioFile)
                        .input(imageFile)
                        .outputOptions(['-pix_fmt yuva420p'])
                        .output(ttsVideoFile)
                );
            }
            const ttsDuration = Math.ceil(await getDuration(ttsVideoFile, true) * 100) / 100;
            return {
                imageFile,
                audioFile,
                ttsDuration,
                videoFile: ttsVideoFile
            };
        } else {
            const ttsDuration = Math.ceil(await getDuration(audioFile, true) * 100) / 100;
            return { imageFile, audioFile, ttsDuration };
        }
    }
    const titleRenderings = await generateCaptionAndAudio(story.title);
    const videoParts = [titleRenderings];
    const silenceAudioFile = Path.join(ttsDir, `silence-${config.tts.extra_silence}.mp3`);
    const silenceVideoFile = Path.join(ttsDir, `silence-${config.tts.extra_silence}.webm`);
    if(config.tts.extra_silence > 0){
        if(!existsAndHasContent(silenceAudioFile)){
            await runWithoutProgress(
                ffmpeg()
                    .input(videoParts[0].audioFile)
                    .inputOptions([`-stream_loop ${Math.ceil(config.tts.extra_silence / videoParts[0].ttsDuration)}`])
                    .withDuration(config.tts.extra_silence)
                    .withNoVideo()
                    .withAudioFilter({
                        filter: 'volume',
                        options: '0'
                    })
                    .output(silenceAudioFile)
            )
            // await runWithoutProgress(
            //     ffmpeg()
            //         .input('anullsrc')
            //         .inputOptions(['-f lavfi'])
            //         .withDuration(config.tts.extra_silence)
            //         .withAudioBitrate(`${config.audio.bitrate}k`)
            //         .output(silenceAudioFile)
            // )
        }
        if(config.video.accurate_render_method){
            const silenceImageFile = Path.join(ttsDir, 'blank.png');
            if(!existsAndHasContent(silenceImageFile)){
                fs.writeFileSync(silenceImageFile, await image.fromText(' '));
            }
            if(!existsAndHasContent(silenceVideoFile)){
                await runWithoutProgress(
                    ffmpeg()
                        .input(silenceAudioFile)
                        .input(silenceImageFile)
                        .outputOptions(['-pix_fmt yuva420p'])
                        .output(silenceVideoFile)
                )
            }
        }
    }
    pb.tick(1);
    for(const sentence of splits){
        const renderings = await generateCaptionAndAudio(sentence);
        videoParts.push(renderings);
        pb.tick(1);
    }
    let finalTTSFile,finalTTSVideoFile;
    if(config.video.accurate_render_method){
        const useConcatParts = videoParts.map(p=>
            config.tts.extra_silence > 0 ?
                [p.videoFile, silenceVideoFile]
                : [p.videoFile]
        ).flat();
        const concatStr = useConcatParts.join('|');
        const hash = crypto.createHash('md5').update(concatStr).digest("hex");
        finalTTSVideoFile = Path.join(ttsDir, `${hash}.webm`);
        if(!existsAndHasContent(finalTTSVideoFile)){
            await concatFiles({
                files: useConcatParts,
                output: finalTTSVideoFile,
                audio_bitrate: config.audio.bitrate,
                video_bitrate: config.video.bitrate,
                demuxer: config.tts.demux_concat,
                progress: true,
                progressLabel: '🎵 Rendering combined TTS...'
            });
        }
    }else{
        const useConcatParts = videoParts.map(p=>
            config.tts.extra_silence > 0 ?
                [p.audioFile, silenceAudioFile]
                : [p.audioFile]
        ).flat();
        const concatStr = useConcatParts.join('|');
        const hash = crypto.createHash('md5').update(concatStr).digest("hex");
        finalTTSFile = Path.join(ttsDir, `${hash}.mp3`);
        if(!existsAndHasContent(finalTTSFile)){
            await concatFiles({
                files: useConcatParts,
                output: finalTTSFile,
                audio_bitrate: config.audio.bitrate,
                demuxer: config.tts.demux_concat,
                progress: true,
                progressLabel: '🎵 Rendering combined TTS audio...'
            });
        }
    }
    const allDurations = videoParts.map(p=>p.ttsDuration+config.tts.extra_silence);
    const calculatedTTSDuration = allDurations.reduce((partialSum, a) => partialSum + a, 0);
    // global.ProgressBar.terminate();
    // console.log('Calculated duration from parts:',calculatedTTSDuration);
    const actualTTSDuration = await getDuration(config.video.accurate_render_method ? finalTTSVideoFile : finalTTSFile, true, true, "⏳ Calculating accurate TTS duration...");
    const totalDurationSeconds = config.video.accurate_render_method ? actualTTSDuration : Math.max(calculatedTTSDuration, actualTTSDuration);
    // global.ProgressBar.terminate();
    // console.log('Actual duration from file:', actualTTSDuration);
    const ttsDurationCorrection = config.video.accurate_render_method ? 0 : ((actualTTSDuration - calculatedTTSDuration) / videoParts.length);
    global.ProgressBar.terminate();
    console.log(`🎥 Video will be ${prettyMilliseconds(totalDurationSeconds * 1000, {verbose: true})} long!`)
    const useVideoFileDuration = await getDuration(useVideoFile);
    if(totalDurationSeconds > useVideoFileDuration){
        if(config.video.loop){
            const numVideoLoops = Math.ceil(totalDurationSeconds / useVideoFileDuration);
            const videoLoopedFile = `${useVideoFile.split('.').slice(0, -1).join('.')}-looped-${numVideoLoops}.${useVideoFile.split('.').pop()}`;
            if(!existsAndHasContent(videoLoopedFile)){
                await runWithProgress(
                    ffmpeg()
                        .input(useVideoFile)
                        .inputOptions([`-stream_loop ${numVideoLoops}`])
                        .withVideoCodec('copy')
                        .withAudioCodec('copy')
                        .output(videoLoopedFile),
                    "🎥 Rendering looped background video..."
                )
            }
            useVideoFile = videoLoopedFile;
            
        }else{
            global.ProgressBar.terminate();
            console.error('Background video is too short. Please enable looping or choose a different video.')
            process.exit(1);
        }
    }
    const useAudioFileDuration = await getDuration(useAudioFile);
    if(totalDurationSeconds > useAudioFileDuration){
        if(config.audio.loop){
            const numAudioLoops = Math.ceil(totalDurationSeconds / useAudioFileDuration);
            const audioLoopedFile = `${useAudioFile.split('.').slice(0, -1).join('.')}-looped-${numAudioLoops}.${useAudioFile.split('.').pop()}`;
            if(!existsAndHasContent(audioLoopedFile)){
                await runWithProgress(
                    ffmpeg()
                        .input(useAudioFile)
                        .inputOptions([`-stream_loop ${numAudioLoops}`])
                        .withAudioCodec('copy')
                        .output(audioLoopedFile),
                    "🎵 Rendering looped background audio..."
                )
            }
            useAudioFile = audioLoopedFile;
        }else{
            global.ProgressBar.terminate();
            console.error('Background audio is too short. Please enable looping or choose a different audio.')
            process.exit(1);
        }
    }
    let start = null;
    if (config.video.video_trim_method == 'keep_start'){
        start = 0;
    } else if (config.video.video_trim_method == 'keep_end'){
        const accurateUseVideoFileDuration = await getDuration(useVideoFile, true, true, "⏳ Calculating accurate background video duration...");
        start = accurateUseVideoFileDuration - totalDurationSeconds;
    }else{ // random
        const accurateUseVideoFileDuration = await getDuration(useVideoFile, true, true, "⏳ Calculating accurate background video duration...");
        const precision = 1000000;
        const extraVideoDuration = Math.floor((accurateUseVideoFileDuration - totalDurationSeconds)*precision);
        start = crypto.randomInt(0, extraVideoDuration+1) / precision; // +1 because the ending is exclusive
    }
    const finalVideoExtension = '.' + config.video.output_format;
    const finalVideoFile = Path.join(outputDir, generateValidFilename(story.title, 256 - finalVideoExtension.length) + finalVideoExtension);
    const finalVideoFilters = [{
        filter: 'amix', options: { inputs: 3 }
    }];
    if(config.video.resizer == 'crop'){
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
    }else{
        if(config.video.scale_pad){
            const aspect = config.video.width / config.video.height;
            finalVideoFilters.push({
                filter: 'scale',
                inputs: '[1:v]', outputs: 'tmp',
                options: {
                    w: 'if(gt(a,' + aspect + '),' + config.video.width + ',trunc(' + config.video.height + '*a/2)*2)',
                    h: 'if(lt(a,' + aspect + '),' + config.video.height + ',trunc(' + config.video.width + '/a/2)*2)'
                }
            });
            finalVideoFilters.push({
                filter: 'pad',
                inputs: '[tmp]', outputs: 'tmp',
                options: {
                    w: config.video.width,
                    h: config.video.height,
                    x: 'if(gt(a,' + aspect + '),0,(' + config.video.width + '-iw)/2)',
                    y: 'if(lt(a,' + aspect + '),0,(' + config.video.height + '-ih)/2)',
                    color: config.video.scale_pad_color
                }
              });
        }else{
            finalVideoFilters.push({ filter: 'scale', inputs: '[1:v]', outputs: 'tmp', options: `${config.video.width}:${config.video.height},setsar=1` });
        }
    }
    let finalVideoCmd = ffmpeg({ stdoutLines: 0}).input(config.video.accurate_render_method ? finalTTSVideoFile : finalTTSFile) // 0
    // This is a hack to render the vcodec flag in the right spot of the ffmpeg cmd, it is used twice, after the second and third inputs
    // This took quite some testing to figure out, but was the cause of a bug with a black screen
    if(config.video.accurate_render_method){
        finalVideoCmd = finalVideoCmd.inputOptions(['-vcodec libvpx-vp9']);
    }
    finalVideoCmd = finalVideoCmd.input(useVideoFile).seekInput(start) // 1
    // if(config.video.accurate_render_method){
    //     finalVideoCmd = finalVideoCmd.inputOptions(['-vcodec libvpx-vp9']);
    // }
    finalVideoCmd=finalVideoCmd.input(useAudioFile) // 2
    if(config.video.accurate_render_method){
        finalVideoCmd = finalVideoCmd.inputOptions(['-vcodec libvpx-vp9']);
    }
    finalVideoCmd=finalVideoCmd.withDuration(totalDurationSeconds)
    const overlayFilters = [];
    if(config.video.accurate_render_method){
        // finalVideoCmd = finalVideoCmd.outputOptions(['-pix_fmt yuva420p']).withVideoCodec('libvpx-vp9')
        overlayFilters.push({
            filter: 'scale2ref',
            inputs: `[0:v][tmp]`,
            outputs: `[scaled-tts][tmp]`, // possible change tmp to throwaway
            options: {
                w: "iw",
                h: "ih",
            }
        });
        overlayFilters.push({
            filter: 'overlay',
            inputs: `[tmp][scaled-tts]`,
            outputs: 'tmp',
            options: {
                x: "(main_w-overlay_w)/2",
                y: "(main_h-overlay_h)/2",
            }
        });
    }else {
        let currentTime = 0;
        let inputIndex = 2;
        for(const videoPart of videoParts){
            const ttsDuration = videoPart.ttsDuration + (config.video.autocorrect_tts_duration ? ttsDurationCorrection : 0);
            finalVideoCmd = finalVideoCmd.input(videoPart.imageFile);
            inputIndex++;
            overlayFilters.push({
                filter: 'scale2ref',
                inputs: `[${inputIndex}:v][tmp]`,
                outputs: `[scaled-input-${inputIndex}][tmp]`,
                options: {
                    w: "iw",
                    h: "ih",
                }
            })
            overlayFilters.push({
                filter: 'overlay',
                inputs: `[tmp][scaled-input-${inputIndex}]`,
                outputs: 'tmp',
                options: {
                    x: "(main_w-overlay_w)/2",
                    y: "(main_h-overlay_h)/2",
                    enable: `between(t,${currentTime},${currentTime + ttsDuration})`,
                }
            })
            currentTime = currentTime + ttsDuration + config.tts.extra_silence;
        }
    }
    await runWithProgress(
        finalVideoCmd
            .complexFilter([...finalVideoFilters, ...overlayFilters], 'tmp')
            .withAudioBitrate(`${config.audio.bitrate}k`)
            .withVideoBitrate(config.video.bitrate) // k is automatically appended here
            .output(finalVideoFile)
        ,
        "🎥 Rendering final video..."
    )
    global.ProgressBar.terminate();
    if(config.story.source.name == 'reddit'){
        RedditUtil.markComplete(story.id);
    }
    if(config.cleanup.youtube){
        fs.rmSync(youtubeDir, { recursive: true, force: true });
    }
    if(config.cleanup.tts){
        fs.rmSync(ttsDir, { recursive: true, force: true });
    }
    if(config.cleanup.captions){
        fs.rmSync(captionsDir, { recursive: true, force: true });
    }
    global.ProgressBar.terminate();
    console.log(`Video has been output to: ${finalVideoFile}`)
}

main();