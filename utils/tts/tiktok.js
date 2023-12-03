const fs = require('fs');
const Path = require('path');
const crypto = require('crypto');
const axios = require('axios');

const { ttsDir } = require('../dirs');
const { concatFiles } = require('../ffmpeg');

async function callAPI(text, sessionId, voice='en_male_narration'){
    try {
        const response = await axios.post('https://tiktok-tts.weilnet.workers.dev/api/generation', { text, voice }, {
            headers: {
                "User-Agent": "com.zhiliaoapp.musically/2022600030 (Linux; U; Android 7.1.2; es_ES; SM-G988N; Build/NRD90M;tt-ok/3.12.13.1)",
                "Cookie": `sessionid=${sessionId}`,
                "Content-Type": "application/json"
            }
        });
        if(response.data.error){
            throw new Error(response.data.error);
        }
        if(!response.data.data){
            throw new Error("Invalid response when generating Tiktok voice!");
        }
        return Buffer.from(response.data.data, 'base64');
    }catch(err){
        throw new Error(
            err?.response?.data?.error ||
            err?.response?.data ||
            err?.message ||
            err
        );
    }
}

class TikTokTTS {
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
            if(testPart.length > 300){
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
            const partAudio = await callAPI(part, this.config.tts.tiktok_session_id, this.config.tts.voice);
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

const disneyVoices = [
    "en_us_ghostface",  // Ghost Face
    "en_us_chewbacca",  // Chewbacca
    "en_us_c3po",       // C3PO
    "en_us_stitch",     // Stitch
    "en_us_stormtrooper",  // Stormtrooper
    "en_us_rocket",        // Rocket
    "en_female_madam_leota",  // Madame Leota
    "en_male_ghosthost",     // Ghost Host
    "en_male_pirate"         // Pirate
];

const engVoices = [
    "en_au_001",  // English AU - Female
    "en_au_002",  // English AU - Male
    "en_uk_001",  // English UK - Male 1
    "en_uk_003",  // English UK - Male 2
    "en_us_001",  // English US - Female (Int. 1)
    "en_us_002",  // English US - Female (Int. 2)
    "en_us_006",  // English US - Male 1
    "en_us_007",  // English US - Male 2
    "en_us_009",  // English US - Male 3
    "en_us_010",  // English US - Male 4
    "en_male_narration",    // Narrator
    "en_female_emotional",  // Peaceful
    "en_male_cody"          // Serious
];

const nonEngVoices = [
    // Western European voices
    "fr_001",  // French - Male 1
    "fr_002",  // French - Male 2
    "de_001",  // German - Female
    "de_002",  // German - Male
    "es_002",  // Spanish - Male
    "it_male_m18",  // Italian - Male
    // South American voices
    "es_mx_002",  // Spanish MX - Male
    "br_001",     // Portuguese BR - Female 1
    "br_003",     // Portuguese BR - Female 2
    "br_004",     // Portuguese BR - Female 3
    "br_005",     // Portuguese BR - Male
    // Asian voices
    "id_001",  // Indonesian - Female
    "jp_001",  // Japanese - Female 1
    "jp_003",  // Japanese - Female 2
    "jp_005",  // Japanese - Female 3
    "jp_006",  // Japanese - Male
    "kr_002",  // Korean - Male 1
    "kr_003",  // Korean - Female
    "kr_004"   // Korean - Male 2
];

const vocals = [
    "en_female_f08_salut_damour",  // Alto
    "en_male_m03_lobby",           // Tenor
    "en_male_m03_sunshine_soon",   // Sunshine Soon
    "en_female_f08_warmy_breeze",  // Warmy Breeze
    "en_female_ht_f08_glorious",   // Glorious
    "en_male_sing_funny_it_goes_up",  // It Goes Up
    "en_male_m2_xhxs_m03_silly",      // Chipmunk
    "en_female_ht_f08_wonderful_world" // Dramatic
];

exports = module.exports = {
    TikTokTTS,
    voices: {
        disneyVoices,
        engVoices,
        nonEngVoices,
        vocals,
    }
};