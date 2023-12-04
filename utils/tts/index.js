const { TikTokTTS, voices: TikTokTTSVoices } = require('./tiktok');
const { GoogleTranslateTTS, voices: GoogleTranslateTTSVoices } = require('./google-translate');

class TTSUtil {
    constructor(config){
        this.config = config;
        this.ttsModules = {
            'tiktok': new TikTokTTS(config),
            'google-translate': new GoogleTranslateTTS(config)
        };
    }
    async generate(text){
        return this.ttsModules[this.config.tts.name].generate(text);
    }
}

exports = module.exports = {
    TTSUtil,
    voices: {
        'tiktok': TikTokTTSVoices,
        'google-translate': GoogleTranslateTTSVoices,
    }
}