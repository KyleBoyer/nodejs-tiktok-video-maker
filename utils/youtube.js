const Path = require('path');
const fs = require('fs');
const ytdl = require('ytdl-core');

const { existsAndHasContent } = require('./fs');
const { ffmpeg, runAutoProgress } = require('./ffmpeg');

async function download(url, toDir, MultiProgressBar = undefined){
    const urlInfo = await ytdl.getInfo(url);
    const urlID = urlInfo.videoDetails.videoId;
    const urlFile = Path.join(toDir, `${urlID}.mp4`);
    if(existsAndHasContent(urlFile)){
        return urlFile;
    }
    const audioDownloadStream = ytdl(url, { quality: 'highestaudio' });
    const pipeAudioStream = audioDownloadStream.pipe(
        fs.createWriteStream(`${urlFile}.audio.tmp`)
    );
    // const tracker = {
    //     audio: { downloaded: 0, total: 0},
    //     video: { downloaded: 0, total: 0},
    // };
    if(MultiProgressBar){
        const audioBar = MultiProgressBar.newDefaultBarWithLabel('⬇️ Downloading YouTube audio...');
        audioDownloadStream.on('progress', (_, downloaded, total) => {
            audioBar.update(downloaded / total);
        });
    }
    const videoDownloadStream = ytdl(url, { quality: 'highestvideo' });
    const pipeVideoStream = videoDownloadStream.pipe(
        fs.createWriteStream(`${urlFile}.video.tmp`)
    );
    if(MultiProgressBar){
        const videoBar = MultiProgressBar.newDefaultBarWithLabel('⬇️ Downloading YouTube video...');
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
    fs.unlinkSync(`${urlFile}.video.tmp`);
    fs.unlinkSync(`${urlFile}.audio.tmp`);
    return urlFile;
}

exports = module.exports = {
    download
};