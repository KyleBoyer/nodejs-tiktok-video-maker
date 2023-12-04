
const fs = require('fs');
const Path = require('path');
const crypto = require('crypto');
const googleTTS = require('google-tts-api');

const { ttsDir } = require('../dirs');
const { concatFiles } = require('../ffmpeg');

async function callAPI(text){
    try {
        const ttsBase64 = await googleTTS.getAudioBase64(text, {
            lang: 'en',
            slow: false,
            host: 'https://translate.google.com',
            timeout: 10000,
        });
        return Buffer.from(ttsBase64, 'base64');
    }catch(err){
        throw new Error(
            err?.response?.data?.error ||
            err?.response?.data ||
            err?.message ||
            err
        );
    }
}

class GoogleTranslateTTS {
    constructor(config){
        this.config = config;
    }
    async generate(text){
        const hash = crypto.createHash('md5').update(text).digest("hex");
        const words = text.split(/\s/);
        const textParts = [];
        let currentPart = words[0];
        for(let i = 1; i < words.length; i++){
            let testPart = currentPart + ' ' + words[i];
            if(testPart.length > 200){
                textParts.push(currentPart);
                currentPart = words[i];
            } else {
                currentPart = testPart;
            }
        }
        textParts.push(currentPart);
        const combineParts = [];
        let i = 1;
        for(const part of textParts){
            const partFile = Path.join(ttsDir, `${hash}-part-${i}.mp3`)
            const partAudio = await callAPI(part);
            fs.writeFileSync(partFile, partAudio);
            combineParts.push(partFile);
            i++;
        }
        const combinedFile = Path.join(ttsDir, `${hash}-combined.mp3`);
    
        await concatFiles({
            files: combineParts,
            output: combinedFile,
            audio_bitrate: this.config.audio.bitrate,
            demuxer: this.config.tts.demux_concat,
            progress: false,
        });
        for(const combinePart of combineParts){
            fs.unlinkSync(combinePart);
        }
        const retBuffer = fs.readFileSync(combinedFile);
        fs.unlinkSync(combinedFile);
        return retBuffer;
    }
}

exports = module.exports = {
    GoogleTranslateTTS,
    voices: []
};