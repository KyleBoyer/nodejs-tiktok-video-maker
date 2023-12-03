const { TikTokTTS, voices: TikTokTTSVoices } = require('./tiktok')

class TTSUtil {
    constructor(config){
        this.config = config;
        this.tiktok = new TikTokTTS(config);
    }
    async generate(text){
        return this.tiktok.generate(text);
    }
}

exports = module.exports = {
    TTSUtil,
    voices: {
        tiktok: TikTokTTSVoices
    }
}