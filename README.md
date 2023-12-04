# nodejs-tiktok-video-maker

## Description
This utility can be used to create composite TikTok videos. It will take an input of a background video, background music, and a story, and compose it to one video.

## Inspiration
I was inspired to created this after briefly using https://github.com/elebumm/RedditVideoMakerBot
I noticed some bugs and features that I wanted to add, and did contribute these back. However, due to the variety of changes and features, I decided to start writing my own script. Thus, this utility was born.

## How to run
 - Install `ffmpeg`
 - Install dependencies with `npm install`
 - Create a config.json in the same directory you will be running this script from.
   - Config file must include the required fields, if you create the config.json with `{}`, and run the main script, it will error out and inform you of which fields are missing or incorrect.
 - Run the main script `node index.js`

### TODO
 - All AI functions
 - Screenshot Reddit Title function
 - More TTS voice options
 - Review CONFIG.md and improve it
 - Dockerfile
 - Check for windows support, or force them to use Docker if it can't work


### Nice to have
 - ESLint
 - Typescript
 - Translate story
 - Caption effects
 - Web UI
 - Config file builder / helper (might be pointless if the web UI does this)