const fs = require('fs');
const yup = require('yup');

const textReplacementSchema = yup.array().of(yup.string().required()).min(2).max(2).required();

const audioSchema = yup.object({
    speed: yup.number().min(0.5).max(100).default(1),
    volume: yup.number().min(0).max(1).default(0.15),
    url: yup.string().required(),
    loop: yup.boolean().default(true),
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
        keep_end: yup.boolean().default(false),
        keep_beginning: yup.boolean().default(false),
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
        voice: yup.string().default('en_male_narration').optional(),
        demux_concat: yup.boolean().default(true),
        tiktok_session_id: yup.string().when('tts', { is: 'tiktok', then: s => s.required(), otherwise: s=>s.optional()}),
        extra_silence: yup.number().min(0).default(0.3),
    }),
    story: yup.object({
        source: yup.object({
            name: yup.string().required().oneOf(['reddit', 'ai']),
            // AI Specific
            ai_type: yup.string().oneOf(['openai']).default('openai').when('name', { is: 'ai', then: s => s.required(), otherwise: s => s.optional()}), // TODO support different AI types
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
        }).test('refresh_token or (username and password)', '`refresh_token` OR (`username` AND `password`) is required', v => {
            return v.name == 'reddit' && (v.refresh_token || (v.username && v.password))
        })
    }),
    replacements: yup.object({
        'text-and-audio': yup.array().of(textReplacementSchema).default([]),
        'text-only': yup.array().of(textReplacementSchema).default([]),
        'audio-only': yup.array().of(textReplacementSchema).default([]),
    })
});

function loadConfig(fileName=`${process.cwd()}/config.json`){
    const fileContents = fs.readFileSync(fileName);
    const parsed = JSON.parse(fileContents);
    const config = validateConfig(parsed);
    return config;
}

function validateConfig(configObj){
    const config = configSchema.validateSync(configObj)
    return config;
}

exports = module.exports = {
    loadConfig
}