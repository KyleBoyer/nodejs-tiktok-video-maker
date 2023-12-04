const os = require('os');
const fs = require('fs');
const tmp = require('tmp');
const ffmpeg = require('fluent-ffmpeg');

function runAutoProgress(ffmpegCmd, MultiProgressBar, label='🎥 Rendering...', appearAfter=1500){
    let bar;
    let preBarProgress = 0;
    return new Promise((resolve, reject) => {
        let cmd;
        let barStartTimer = setTimeout(() => {
            bar = MultiProgressBar.newDefaultBarWithLabel(label);
            bar.update(preBarProgress);
        }, appearAfter)
        ffmpegCmd
            .outputOptions([`-threads ${os.cpus().length}`, '-y'])
            .on('progress', (progress) => {
                const progressDecimal = progress.percent / 100;
                if(bar){
                    bar.update(progressDecimal);
                }else{
                    preBarProgress = progressDecimal;
                }
            })
            .on('start', ffmpegCLICommand => {
                cmd = ffmpegCLICommand;
            })
            .on('error', (err) => {
                clearTimeout(barStartTimer);
                reject(err);
            })
            .on('end', (stdout, stderr) => {
                clearTimeout(barStartTimer);
                if(bar){
                    bar.update(100);
                }
                resolve({ stdout, stderr, cmd }); // setImmediate gives the progress bar time to finish rendering
            })
            .run()
        
    })
}

async function getDuration(file, MultiProgressBar, accurate=false, progressLabel='⏳ Calculating duration...', appearAfter=1500){ // Accurate=true takes much longer
    if(accurate){
        let bar;
        let preBarProgress = 0;
        const decodeResult = await new Promise((resolve, reject) => {
            const progressFile = tmp.fileSync().name;
            let barStartTimer = setTimeout(() => {
                bar = MultiProgressBar.newDefaultBarWithLabel(progressLabel);
                bar.update(preBarProgress);
            }, appearAfter)
            ffmpeg({ stdoutLines: 0 })
                .input(file)
                .outputOptions(['-f null', `-progress ${progressFile}`, `-threads ${os.cpus().length}`])
                .output(`/dev/null`)
                .on('error', (err) => {
                    clearTimeout(barStartTimer);
                    reject(err);
                })
                .on('progress', (progress) => {
                    const progressDecimal = progress.percent / 100;
                    if(bar){
                        bar.update(progressDecimal);
                    } else {
                        preBarProgress = progressDecimal;
                    }
                })
                .on('end', () => {
                    clearTimeout(barStartTimer);
                    if(bar){
                        bar.update(100);
                    }
                    const progressLines = fs.readFileSync(progressFile).toString().split('\n').filter(l=>l.includes('out_time_ms'))
                    fs.unlinkSync(progressFile);
                    if(progressLines.length){
                        const lastOutMS = progressLines.pop();
                        const ms = +lastOutMS.split('=').pop().trim()
                        resolve(ms / 1000000);
                    }else{
                        resolve(null);
                    }
                })
                .run()
        });
        if(decodeResult){
            return decodeResult;
        }
    }
    const probeData = await new Promise((resolve, reject) =>
        ffmpeg.ffprobe(file, (err, metadata) => {
            if(err){
                reject(err);
            }else{
                resolve(metadata);
            }
        })
    );
    return probeData['format']['duration'];
}

async function concatFiles(options){
    const files = options.files;
    if(!Array.isArray(files) || files.length <= 0){
        throw new Error("An input file list is required!");
    }
    const outFile = options.output;
    if(!outFile){
        throw new Error("An output file is required!")
    }
    if(files.length == 1){
        fs.copyFileSync(files[0], outFile);
        return { cmd: `cp '${files[0]}' '${outFile}'`, stderr: '', stdout: '' }
    }
    const audio_bitrate = options.audio_bitrate;
    const video_bitrate = options.video_bitrate;
    const MultiProgressBar = options.MultiProgressBar;
    const progressLabel = options.progressLabel;
    const demuxer = options.demuxer ?? true;
    const runCmd = cmd => runAutoProgress(cmd, MultiProgressBar, progressLabel)
    if(demuxer){
        const fileListingFile = `${outFile}.txt`;
        fs.writeFileSync(fileListingFile, files.map(f=>`file '${f}'\n`).join(''));
        let ffmpegCmd = ffmpeg({ stdoutLines: 0 })
            .input(fileListingFile)
            .inputOptions(['-f concat', '-safe 0'])
        if(audio_bitrate){
            ffmpegCmd = ffmpegCmd.withAudioBitrate(audio_bitrate);
        }
        if(video_bitrate){
            ffmpegCmd = ffmpegCmd.withVideoBitrate(video_bitrate);
        }
        ffmpegCmd = ffmpegCmd
            .outputOptions(['-c copy'])
            .output(outFile);
        const output = await runCmd(ffmpegCmd);
        fs.unlinkSync(fileListingFile);
        return output;
    }else{
        const concatInputStr = `concat:${files.join('|')}`;
        let ffmpegCmd = ffmpeg({ stdoutLines: 0 }).input(concatInputStr);
        if(audio_bitrate){
            ffmpegCmd = ffmpegCmd.withAudioBitrate(audio_bitrate);
        }
        if(video_bitrate){
            ffmpegCmd = ffmpegCmd.withVideoBitrate(video_bitrate);
        }
        ffmpegCmd = ffmpegCmd
            .outputOptions(['-c copy'])
            .output(outFile);
        const output = await runCmd(ffmpegCmd);
        return output;
    }
}

exports = module.exports = {
    runAutoProgress,
    getDuration,
    ffmpeg,
    concatFiles,
}