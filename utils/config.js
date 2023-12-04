const fs = require('fs');
const yup = require('yup');

const { voices } = require('./tts');

const isString = str => typeof str === 'string' || str instanceof String;
const flattenVoices = (voices) => {
    const flattenMore = v=> isString(v) ? v : flattenVoices(v);
    if(Array.isArray(voices)){
        return voices.flat().map(flattenMore).flat();
    }
    return Object.values(voices).flat().map(flattenMore).flat();
}

const textReplacementSchema = yup.array().of(yup.string().required()).min(2).max(2).required();

const audioSchema = yup.object({
    speed: yup.number().min(0.5).max(100).default(1),
    volume: yup.number().min(0).max(1).default(0.15),
    url: yup.string().required(),
    loop: yup.boolean().default(true),
    tim_method: yup.string().oneOf(['keep_start', 'keep_end', 'random']).default('keep_start'),
});

const configSchema = yup.object({
    cleanup: yup.object({
        youtube: yup.boolean().default(false),
        tts: yup.boolean().default(true),
        captions: yup.boolean().default(true),
    }),
    captions: yup.object({
        nlp_splitter: yup.string().oneOf(['compromise', 'wink', 'natural']).default('compromise'),
        line_padding: yup.object({
            height: yup.number().default(10),
            width: yup.number().default(200),
        }),
        background: yup.string().default('rgba(0, 0, 0, 0)'),
        color: yup.string().default('white'),
        stroke_color: yup.string().default('black'),
        stroke_width: yup.number().default(5),
        font: yup.string().default('Roboto-Regular'),
        font_size: yup.number().default(50),
    }),
    video: yup.object({
        speed: yup.number().min(0.5).max(100).default(1),
        volume: yup.number().min(0).max(1).default(0),
        resizer: yup.string().oneOf(['crop', 'scale']).default('crop'),
        crop_style_width: yup.string().oneOf(['left', 'center', 'right']).default('center'),
        crop_style_height: yup.string().oneOf(['top', 'center', 'bottom']).default('center'),
        scale_pad: yup.boolean().default(true),
        scale_pad_color: yup.string().default('black'),
        tim_method: yup.string().oneOf(['keep_start', 'keep_end', 'random']).default('random'),
        url: yup.string().required(),
        loop: yup.boolean().default(true),
        height: yup.number().min(1).default(1920),
        width: yup.number().min(1).default(1080),
        bitrate: yup.number().default(25 * 1000), // in 'kB/s'
        autocorrect_tts_duration: yup.boolean().default(true),
        accurate_render_method: yup.boolean().default(true),
        output_format: yup.string().oneOf(['mp4', 'webm']).default('mp4')
    }),
    audio: audioSchema.when('video', {
        is: v => v.accurate_render_method,
        then: (s) => s.shape({
            bitrate: yup.number().oneOf([8, 16, 24, 32, 40, 48, 64, 80, 96, 112, 128, 160, 192, 224, 256]).default(256),  // in 'kB/s'
        }),
        otherwise: (s) => s.shape({
            bitrate: yup.number().oneOf([8, 16, 24, 32, 40, 48, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]).default(320),  // in 'kB/s'
        }),
    }),
    tts: yup.object({
        name: yup.string().oneOf(['tiktok']).default('tiktok'), // TODO support more TTS services
        speed: yup.number().min(0.5).max(100).default(1),
        volume: yup.number().min(0).max(1).default(1),
        voice: yup.string().default('en_male_narration').when('name', (name, s) => {
            const ttsSpecificVoices = voices[name];
            let newS = s;
            if(ttsSpecificVoices.length){
                newS = newS.oneOf(flattenVoices(ttsSpecificVoices));
            }
            if(ttsSpecificVoices.length == 1){
                newS = newS.default(ttsSpecificVoices[0]);
            }
            return newS;
        }),
        demux_concat: yup.boolean().default(true),
        tiktok_session_id: yup.string().when('tts', { is: 'tiktok', then: s => s.required(), otherwise: s=>s.optional()}),
        extra_silence: yup.number().min(0).default(0.3),
    }),
    story: yup.object({
        source: yup.object({
            name: yup.string().required().oneOf(['reddit', 'ai']),
            // AI Specific
            ai_type: yup.string().oneOf(['openai']).default('openai').when('name', { is: 'ai', then: s => s.required(), otherwise: s => s.optional()}), // TODO support different AI types
            openai_api_key: yup.string().when(['name', 'ai_type', 'ai_rewrite'], {
                is: (name, ai_type, ai_rewrite) => ai_type == 'openai' && (name == 'ai' || ai_rewrite),
                then: s => s.required(),
                otherwise: s => s.optional()
            }),
            prompt: yup.string().when('name', { is: 'ai', then: s => s.required(), otherwise: s => s.optional()}),
            generated_min_length: yup.number().default(500).when('name', { is: 'ai', then: s => s.required(), otherwise: s => s.optional()}),
            // Reddit Specific
            post_id: yup.string().optional(),
            client_id: yup.string().when('name', { is: 'reddit', then: s => s.required(), otherwise: s => s.optional()}),
            client_secret: yup.string().when('name', { is: 'reddit', then: s => s.required(), otherwise: s => s.optional()}),
            refresh_token: yup.string().optional(),
            username: yup.string().optional(),
            password: yup.string().optional(),
            ai_rewrite: yup.boolean().default(false).when('name', { is: 'reddit', then: s => s.required(), otherwise: s => s.optional()}),
            screenshot_title: yup.boolean()
                .when('ai_rewrite', { is: true, then: s => s.default(false), otherwise: s => s.default(true)})
                .when('name', { is: 'reddit', then: s => s.required(), otherwise: s => s.optional()}),
            random: yup.boolean().default(true).when('name', { is: 'reddit', then: s => s.required(), otherwise: s => s.optional()}),
            // Reddit Random Specific
            random_limit: yup.number().default(50)
                .when(['name', 'random'], { is: (name, random) => name == 'reddit' && random, then: s => s.required(), otherwise: s => s.optional()}),
            random_subreddits: yup.array().of(yup.string())
                .when(['name', 'random'], { is: (name, random) => name == 'reddit' && random, then: s => s.min(1).required(), otherwise: s => s.optional()}),
            random_min_comments: yup.number().default(0)
                .when(['name', 'random'], { is: (name, random) => name == 'reddit' && random, then: s => s.required(), otherwise: s => s.optional()}),
            random_max_length: yup.number().default(Number.MAX_SAFE_INTEGER)
                .when(['name', 'random'], { is: (name, random) => name == 'reddit' && random, then: s => s.required(), otherwise: s => s.optional()}),
            random_min_length: yup.number().default(30)
                .when(['name', 'random'], { is: (name, random) => name == 'reddit' && random, then: s => s.required(), otherwise: s => s.optional()}),
            random_allow_nsfw: yup.boolean().default(false)
                .when(['name', 'random'], { is: (name, random) => name == 'reddit' && random, then: s => s.required(), otherwise: s => s.optional()}),
        }).test('story.source.refresh_token or (story.source.username and story.source.password)', 'story.source.refresh_token OR (story.source.username AND story.source.password) is required', v => {
            return !v.name || v.name != 'reddit' || (v.refresh_token || (v.username && v.password))
        }).test('story.source.post_id OR story.source.random', 'story.source.post_id OR story.source.random is required', v => {
            return !v.name || v.name != 'reddit' || (v.post_id || v.random)
        })
    }),
    replacements: yup.object({
        'text-and-audio': yup.array().of(textReplacementSchema).default([]),
        'text-only': yup.array().of(textReplacementSchema).default([]),
        'audio-only': yup.array().of(textReplacementSchema).default([]),
    })
});

function loadConfig(fileName=`${process.cwd()}/config.json`){
    if(!fs.existsSync(fileName)){
        console.error(`"${process.cwd()}/config.json" does not exist!`)
        process.exit(1);
    }
    const fileContents = fs.readFileSync(fileName);
    let parsed;
    try {
        parsed = JSON.parse(fileContents);
    } catch (_err){
        console.error(`"${process.cwd()}/config.json" is not valid JSON!`);
        process.exit(1);
    }
    let config;
    try {
        config = validateConfig(parsed);
    } catch (err) {
        if(Array.isArray(err.errors) && err.errors.length > 0){
            console.error(`"${process.cwd()}/config.json" had the following configuration issues:\n${err.errors.join('\n')}`);
            process.exit(1);
        }
        throw err;
    }
    return config;
}

function validateConfig(configObj){
    const config = configSchema.validateSync(configObj, {
        abortEarly: false,
        stripUnknown: true
    })
    return config;
}

exports = module.exports = {
    loadConfig
}