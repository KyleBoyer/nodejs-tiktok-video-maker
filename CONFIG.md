# Guide to `config.json` Schema (AI GENERATED - some things may be incorrect)

The `config.json` file is a configuration template for a JavaScript application. This guide will help you understand its schema and how to configure it for your specific needs.

## Audio Configuration
- **speed**: Defines the playback speed of the audio. Range: 0.5 (slow) to 100 (fast). Default is 1 (normal speed).
- **volume**: Sets the audio volume. Range: 0 (muted) to 1 (maximum volume). Default is 0.15.
- **url**: The URL of the audio file. This is a required field.
- **loop**: Determines whether the audio should loop. Default is `true` (it will loop).

## Cleanup Configuration
Controls how different components are cleaned up:
- **youtube**: If `true`, YouTube-related resources are cleaned up. Default is `false`.
- **tts** (Text-to-Speech): If `true`, TTS resources are cleaned up. Default is `true`.
- **captions**: If `true`, caption resources are cleaned up. Default is `true`.

## Captions Configuration
Customizes caption appearance and behavior:
- **nlp_splitter**: Chooses the NLP (Natural Language Processing) library for splitting text. Options: `compromise`, `wink`, `natural`. Default is `compromise`.
- **line_padding**: Sets padding for caption lines with `height` and `width` properties.
- **background**: The background color of captions, using RGBA format. Default is transparent (`rgba(0, 0, 0, 0)`).
- **color**: Text color of captions. Default is `white`.
- **stroke_color**: Outline color of caption text. Default is `black`.
- **stroke_width**: Width of the text outline. Default is 5.
- **font**: The font family for captions. Default is `Roboto-Regular`.
- **font_size**: Size of the caption font. Default is 50.

## Video Configuration
Settings for video playback and editing:
- **speed**: Playback speed of the video. Range: 0.5 to 100. Default is 1.
- **volume**: Audio volume in the video. Range: 0 to 1. Default is 0.
- **resizer**: Method of resizing the video. Options: `crop`, `scale`. Default is `crop`.
- **crop_style_width** and **crop_style_height**: Determines how the video is cropped. Options for each: `left`, `center`, `right` for width, and `top`, `center`, `bottom` for height. Defaults are `center`.
- **scale_pad**: If `true`, adds padding when scaling. Default is `true`.
- **scale_pad_color**: Color of the padding when scaling. Default is `black`.
- **keep_end** and **keep_beginning**: Determines whether to keep the beginning or end of the video. Both default to `false`.
- **url**: URL of the video file. This is required.
- **loop**: If `true`, the video will loop. Default is `true`.
- **height** and **width**: Dimensions of the video. Default is 1920x1080.
- **bitrate**: Bitrate of the video in 'kB/s'. Default is 25000.
- **autocorrect_tts_duration**: If `true`, automatically adjusts TTS duration to match video duration. Default is `true`.
- **accurate_render_method**: If `true`, uses a more accurate but possibly slower rendering method. Default is `true`.
- **output_format**: Video output format. Options: `mp4`, `webm`. Default is `mp4`.

## TTS (Text-to-Speech) Configuration
Settings for Text-to-Speech:
- **name**: The name of the TTS service. Default is `tiktok`.
- **speed**: TTS speech speed. Range: 0.5 to 100. Default is 1.
- **volume**: TTS volume. Range: 0 to 1. Default is 1.
- **voice**: The voice type for TTS. Default is `en_male_narration`.
- **demux_concat**: If `true`, separates and then concatenates audio tracks. Default is `true`.
- **tiktok_session_id**: Session ID for TikTok, required if TTS service is `tiktok`.
- **extra_silence**: Adds extra silence at the end of TTS audio. Default is 0.3 seconds.

## Story Configuration
Customizes the story source and related settings:
- **source**: Configures the source of the story. Options include `reddit` and `ai`.
- **ai_type**: For AI stories, specifies the AI type. Default is `openai`.
- **prompt**: Required for AI stories; the prompt to generate the story.
- **generated_min_length**: Minimum length for an AI-generated story.
- **post_id**, **client_id**, **client_secret**, **refresh_token**, **username**, **password**: Reddit-specific authentication and configuration settings.
- **ai_rewrite**: If `true`, AI rewrites Reddit posts. Default is `false`.
- **screenshot_title**: If `true`, includes the title in screenshots. Default varies based on `ai_rewrite`.
- **random**: If `true`, selects random Reddit posts. Default is `true`.
- **random_limit**, **random_subreddits**, **random_min_comments**, **random_max_length**, **random_min_length**, **random_allow_nsfw**: Settings to customize random Reddit post selection.

This configuration schema allows for extensive customization, catering to different requirements for audio, video, TTS, captions, and content sources. Adjust the settings as needed to fit the specific needs of your project.
