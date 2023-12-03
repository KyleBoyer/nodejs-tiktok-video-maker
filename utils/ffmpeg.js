const os = require('os');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');

function runWithProgress(ffmpegCmd, label='🎥 Rendering...'){
    const bar = global.ProgressBar.newDefaultBarWithLabel(label);
    return new Promise((resolve, reject) => {
        let cmd;
        ffmpegCmd
            .outputOptions([`-threads ${os.cpus().length}`, '-y'])
            .on('progress', function(progress) {
                bar.update(progress.percent / 100);
            })
            .on('start', ffmpegCLICommand => {
                cmd = ffmpegCLICommand;
            })
            .on('error', reject)
            .on('end', (stdout, stderr) => {
                bar.update(100);
                resolve({ stdout, stderr, cmd }); // setImmediate gives the progress bar time to finish rendering
            })
            .run()
    })
}

function runWithoutProgress(ffmpegCmd){
    return new Promise((resolve, reject) => {
        let cmd;
        ffmpegCmd
            .outputOptions([`-threads ${os.cpus().length}`, '-y'])
            .on('start', ffmpegCLICommand => {
                cmd = ffmpegCLICommand;
            })
            .on('error', reject)
            .on('end', (stdout, stderr) => resolve({ stdout, stderr, cmd }))
            .run()
    })
}

async function getDuration(file, accurate=false, withProgress=false, progressLabel='⏳ Calcuating duration...'){ // Accurate=true takes much longer
    if(accurate){
        // ffmpegCmd = ffmpeg.input(filename).output('/dev/null', f="null", progress='/dev/stdout')
        const bar = withProgress ? global.ProgressBar.newDefaultBarWithLabel(progressLabel) : null;
        const decodeResult = await new Promise((resolve, reject) =>
            ffmpeg({ stdoutLines: 0 })
                .input(file)
                .outputOptions(['-f null', '-progress /dev/stdout', `-threads ${os.cpus().length}`])
                .output(`/dev/null`)
                .on('error', reject)
                .on('progress', function(progress) {
                    if(bar){
                        bar.update(progress.percent / 100);
                    }
                })
                .on('end', function(stdout) {
                    if(bar){
                        bar.update(100);
                    }
                    const stdoutLines = stdout.split('\n').filter(l=>l.includes('out_time_ms'));
                    if(stdoutLines.length){
                        const lastOutMS = stdoutLines.pop();
                        const ms = +lastOutMS.split('=').pop().trim()
                        resolve(ms / 1000000);
                    }else{
                        resolve(null);
                    }
                })
                .run()
        );
        if(decodeResult){
            return decodeResult;
        }
    }
    const probeData = await new Promise((resolve, reject) =>
        ffmpeg.ffprobe(file, function(err, metadata) {
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
    const progress = options.progress ?? false;
    const progressLabel = options.progressLabel;
    const demuxer = options.demuxer ?? true;
    const runCmd = progress ? (cmd) => runWithProgress(cmd, progressLabel) : (cmd) => runWithoutProgress(cmd);
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
    runWithProgress,
    runWithoutProgress,
    getDuration,
    ffmpeg,
    concatFiles,
}