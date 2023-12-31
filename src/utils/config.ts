import { existsSync, readFileSync } from 'fs';
import { object, array, number, boolean, string, StringSchema, AnyObject, Flags, tuple } from 'yup';

import { voices } from './tts';

const isString = (str: unknown) => typeof str === 'string' || str instanceof String;
const flattenVoices = (voices: unknown[] | unknown): string[] => {
  const flattenMore = (v: string | unknown)=> isString(v) ? v : flattenVoices(v);
  if (Array.isArray(voices)) {
    return voices.flat().map(flattenMore).flat() as string[];
  }
  return Object.values(voices).flat().map(flattenMore).flat() as string[];
};

const textReplacementSchema = tuple([string(), string()]); // array().of(string().required()).min(2).max(2).required();

const audioSchema = object({
  speed: number().min(0.5).max(100).default(1),
  volume: number().min(0).max(1).default(0.15),
  url: string().required(),
  loop: boolean().default(true),
  trim_method: string().oneOf(['keep_start', 'keep_end', 'random']).default('keep_start'),
  bitrate: number().oneOf([8, 16, 24, 32, 40, 48, 64, 80, 96, 112, 128, 160, 192, 224, 256]).default(256),
});

const configSchema = object({
  cleanup: object({
    background_audio: boolean().default(false),
    background_video: boolean().default(false),
    tts: boolean().default(true),
    captions: boolean().default(true),
  }),
  captions: object({
    nlp_splitter: string().oneOf(['compromise', 'wink', 'natural']).default('compromise'),
    padding: object({
      height: number().default(200),
      between_lines: number().default(10),
      width: number().default(200),
    }),
    background: string().default('rgba(0, 0, 0, 0)'),
    color: string().default('white'),
    stroke_color: string().default('black'),
    stroke_width: number().default(5),
    font: string().default('Roboto-Regular'),
    font_size: number().default(50),
  }),
  video: object({
    speed: number().min(0.5).max(100).default(1),
    volume: number().min(0).max(1).default(0),
    resize_method: string().oneOf(['crop', 'scale']).default('crop'),
    crop_style_width: string().oneOf(['left', 'center', 'right']).default('center'),
    crop_style_height: string().oneOf(['top', 'center', 'bottom']).default('center'),
    scale_pad: boolean().default(true),
    scale_pad_color: string().default('black'),
    trim_method: string().oneOf(['keep_start', 'keep_end', 'random']).default('random'),
    url: string().required(),
    loop: boolean().default(true),
    height: number().min(1).default(1920),
    width: number().min(1).default(1080),
    bitrate: number().default(25 * 1000), // in 'kB/s'
    autocorrect_tts_duration: boolean().default(true),
    accurate_render_method: boolean().default(true),
    output_format: string().oneOf(['mp4', 'webm']).default('mp4'),
  }),
  audio: audioSchema.when('video', {
    is: (v: { accurate_render_method: boolean }) => !v?.accurate_render_method,
    then: (s) => s.shape({
      bitrate: number().oneOf([8, 16, 24, 32, 40, 48, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]).default(320), // in 'kB/s'
    }),
  }),
  tts: object({
    source: string().oneOf(['google-translate', 'tiktok', 'openai']).default('google-translate'), // TODO support more TTS services
    openai_api_key: string().when('source', {
      is: 'openai',
      then: (s) => s.required(),
      otherwise: (s) => s.optional(),
    }),
    openai_api_base: string().default('https://api.openai.com/v1').when('source', {
      is: 'openai',
      then: (s) => s.required(),
      otherwise: (s) => s.optional(),
    }),
    openai_model: string().default('tts-1').when('source', {
      is: 'openai',
      then: (s) => s.required(),
      otherwise: (s) => s.optional(),
    }),
    openai_tts_rpm: number().required().when('openai_model', {
      is: 'tts-1-hd',
      then: (s) => s.default(3),
      otherwise: (s) => s.default(50),
    }).when('source', {
      is: 'openai',
      then: (s) => s.required(),
      otherwise: (s) => s.optional(),
    }),
    speed: number().min(0.5).max(100).default(1),
    volume: number().min(0).max(1).default(1),
    voice: string().default('en_male_narration').when('source', (source, s) => {
      const useSource = Array.isArray(source) ? source.pop() : source;
      const ttsSpecificVoices = voices[useSource];
      const ttsSpecificVoicesFlat = ttsSpecificVoices ? flattenVoices(ttsSpecificVoices) : [];
      let newS: StringSchema<string, AnyObject, string, Flags> = s;
      if (ttsSpecificVoicesFlat.length) {
        newS = newS.oneOf(ttsSpecificVoicesFlat);
      }
      if (ttsSpecificVoices?.length == 1) {
        newS = newS.default(ttsSpecificVoicesFlat[0]);
      }
      return newS;
    }),
    demux_concat: boolean().default(true),
    tiktok_session_id: string().when('tts', { is: 'tiktok', then: (s) => s.required(), otherwise: (s)=>s.optional()}),
    extra_silence: number().min(0).default(0.3),
  }),
  story: object({
    source: string().required().oneOf(['reddit', 'ai']),
    // AI Specific
    ai_type: string().oneOf(['openai']).default('openai').when('source', { is: 'ai', then: (s) => s.required(), otherwise: (s) => s.optional()}), // TODO support different AI types
    openai_api_key: string().when(['source', 'ai_type', 'ai_rewrite'], {
      is: (source: string, aiType: string, aiRewrite: boolean) => aiType == 'openai' && (source == 'ai' || aiRewrite),
      then: (s) => s.required(),
      otherwise: (s) => s.optional(),
    }),
    openai_api_base: string().default('https://api.openai.com/v1').when(['source', 'ai_type', 'ai_rewrite'], {
      is: (source: string, aiType: string, aiRewrite: boolean) => aiType == 'openai' && (source == 'ai' || aiRewrite),
      then: (s) => s.required(),
      otherwise: (s) => s.optional(),
    }),
    openai_model: string().default('gpt-3.5-turbo-16k').when(['source', 'ai_type', 'ai_rewrite'], {
      is: (source: string, aiType: string, aiRewrite: boolean) => aiType == 'openai' && (source == 'ai' || aiRewrite),
      then: (s) => s.required(),
      otherwise: (s) => s.optional(),
    }),
    openai_new_story_desired_length: number().default(500).when(['source', 'ai_type'], {
      is: (source: string, aiType: string) => aiType == 'openai' && source == 'ai',
      then: (s) => s.required(),
      otherwise: (s) => s.optional(),
    }),
    openai_retries: number().default(5).when(['source', 'ai_type', 'ai_rewrite'], {
      is: (source: string, aiType: string, aiRewrite: boolean) => aiType == 'openai' && (source == 'ai' || aiRewrite),
      then: (s) => s.required(),
      otherwise: (s) => s.optional(),
    }),
    openai_rewrite_retry_fail_on_error: boolean().default(true).when(['source', 'ai_type', 'ai_rewrite'], {
      is: (source: string, aiType: string, aiRewrite: boolean) => aiType == 'openai' && (source == 'ai' || aiRewrite),
      then: (s) => s.required(),
      otherwise: (s) => s.optional(),
    }),
    openai_rewrite_chunk_max_tokens: number().default(1000).when(['source', 'ai_type', 'ai_rewrite'], {
      is: (source: string, aiType: string, aiRewrite: boolean) => aiType == 'openai' && (source == 'ai' || aiRewrite),
      then: (s) => s.required(),
      otherwise: (s) => s.optional(),
    }),
    openai_rewrite_length: number().default(1).when(['source', 'ai_type', 'ai_rewrite'], {
      is: (source: string, aiType: string, aiRewrite: boolean) => aiType == 'openai' && (source == 'ai' || aiRewrite),
      then: (s) => s.required(),
      otherwise: (s) => s.optional(),
    }),
    openai_new_story_prompt: string().when('source', { is: 'ai', then: (s) => s.required(), otherwise: (s) => s.optional()}),
    openai_new_story_min_length: number().default(10).when('source', { is: 'ai', then: (s) => s.required(), otherwise: (s) => s.optional()}),
    // Reddit Specific
    reddit_post_id: string().optional(),
    reddit_client_id: string().when('source', { is: 'reddit', then: (s) => s.required(), otherwise: (s) => s.optional()}),
    reddit_client_secret: string().when('source', { is: 'reddit', then: (s) => s.required(), otherwise: (s) => s.optional()}),
    reddit_user_agent: string().default('nodejs-tiktok-video-maker'),
    reddit_refresh_token: string().optional(),
    reddit_username: string().optional(),
    reddit_password: string().optional(),
    ai_rewrite: boolean().default(false).when('source', { is: 'reddit', then: (s) => s.required(), otherwise: (s) => s.optional()}),
    reddit_screenshot_title: boolean()
        .when('ai_rewrite', { is: true, then: (s) => s.default(false), otherwise: (s) => s.default(true)})
        .when('source', { is: 'reddit', then: (s) => s.required(), otherwise: (s) => s.optional()}),
    reddit_screenshot_title_theme: string().oneOf(['dark', 'light']).default('dark').when('reddit_screenshot_title', { is: true, then: (s) => s.required(), otherwise: (s) => s.optional()}),
    reddit_screenshot_title_zoom: number().default(2.0).when('reddit_screenshot_title', { is: true, then: (s) => s.required(), otherwise: (s) => s.optional()}),
    reddit_random: boolean().default(true).when('source', { is: 'reddit', then: (s) => s.required(), otherwise: (s) => s.optional()}),
    // Reddit Random Specific
    reddit_random_ai_similarity: array().of(string()).default([]),
    reddit_random_limit: number().default(50)
        .when(['source', 'reddit_random'], { is: (source: string, redditRandom: boolean) => source == 'reddit' && redditRandom, then: (s) => s.required(), otherwise: (s) => s.optional()}),
    reddit_random_subreddits: array().of(string())
        .when(['source', 'reddit_random'], { is: (source: string, redditRandom: boolean) => source == 'reddit' && redditRandom, then: (s) => s.min(1).required(), otherwise: (s) => s.optional()}),
    reddit_random_min_comments: number().default(0)
        .when(['source', 'reddit_random'], { is: (source: string, redditRandom: boolean) => source == 'reddit' && redditRandom, then: (s) => s.required(), otherwise: (s) => s.optional()}),
    reddit_random_max_length: number().default(Number.MAX_SAFE_INTEGER)
        .when(['source', 'reddit_random'], { is: (source: string, redditRandom: boolean) => source == 'reddit' && redditRandom, then: (s) => s.required(), otherwise: (s) => s.optional()}),
    reddit_random_min_length: number().default(30)
        .when(['source', 'reddit_random'], { is: (source: string, redditRandom: boolean) => source == 'reddit' && redditRandom, then: (s) => s.required(), otherwise: (s) => s.optional()}),
    reddit_random_allow_nsfw: boolean().default(false)
        .when(['source', 'reddit_random'], { is: (source: string, redditRandom: boolean) => source == 'reddit' && redditRandom, then: (s) => s.required(), otherwise: (s) => s.optional()}),
  }).test('story.reddit_refresh_token or (story.reddit_username and story.reddit_password)', 'story.reddit_refresh_token OR (story.reddit_username AND story.reddit_password) is required', (v) => {
    return !!(!v.source || v.source != 'reddit' || (v.reddit_refresh_token || (v.reddit_username && v.reddit_password)));
  }).test('story.reddit_post_id OR story.reddit_random', 'story.reddit_post_id OR story.reddit_random is required', (v) => {
    return !!(!v.source || v.source != 'reddit' || (v.reddit_post_id || v.reddit_random));
  }),
  replacements: object({
    'text-and-audio': array().of(textReplacementSchema).default([]),
    'text-only': array().of(textReplacementSchema).default([]),
    'audio-only': array().of(textReplacementSchema).default([]),
  }),
});

export function loadConfig(fileName=`${process.cwd()}/config.json`) {
  if (!existsSync(fileName)) {
    console.error(`"${process.cwd()}/config.json" does not exist!`);
    process.exit(1);
  }
  const fileContents = readFileSync(fileName).toString();
  let parsed: unknown;
  try {
    parsed = JSON.parse(fileContents);
  } catch (_err) {
    console.error(`"${process.cwd()}/config.json" is not valid JSON!`);
    process.exit(1);
  }
  let config;
  try {
    config = validateConfig(parsed);
  } catch (err) {
    if (Array.isArray(err.errors) && err.errors.length > 0) {
      console.error(`"${process.cwd()}/config.json" had the following configuration issues:\n${err.errors.join('\n')}`);
      process.exit(1);
    }
    throw err;
  }
  return config;
}

export function validateConfig(configObj: unknown) {
  const config = configSchema.validateSync(configObj, {
    abortEarly: false,
    stripUnknown: true,
  });
  return config;
}
