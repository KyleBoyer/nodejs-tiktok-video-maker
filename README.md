# nodejs-tiktok-video-maker

## Description
This utility can be used to create composite TikTok videos. It will take an input of a background video, background music, and a story, and compose it to one video.

## Inspiration
I was inspired to created this after briefly using https://github.com/elebumm/RedditVideoMakerBot
I noticed some bugs and features that I wanted to add, and did contribute these back. However, due to the variety of changes and features, I decided to start writing my own script. Thus, this utility was born.

### TODO
 - Confirm fonts are working properly with image rendering
 - Better settings for keep_end vs keep_start vs random
 - Config use `oneOf` to validate tts voice is valid
 - All AI functions
 - Screenshot Reddit Title function
 - More TTS voice options
 - Review CONFIG.md and improve it


### Nice to have
 - Translate story
 - Caption effects
 - Reduce `/utils/*` files depedency on config.js
   - Pass in config from parent calling function
 - Better passing of the global.ProgressBar
 - Web UI