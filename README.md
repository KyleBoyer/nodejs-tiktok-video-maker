# nodejs-tiktok-video-maker

## Description
This utility can be used to create composite TikTok videos. It will take an input of a background video, background music, and a story, and compose it to one video.

## Inspiration
I was inspired to created this after briefly using https://github.com/elebumm/RedditVideoMakerBot
I noticed some bugs and features that I wanted to add, and did contribute these back. However, due to the variety of changes and features, I decided to start writing my own script. Thus, this utility was born.

## How to run
 - Install `ffmpeg` and `ffprobe`
 - WINDOWS USERS: [Must set two environment variables, click here for more info](https://github.com/fluent-ffmpeg/node-fluent-ffmpeg#:~:text=at%20the%20moment.-,Windows%20users,-%3A%20most%20probably%20ffmpeg)
 - Install dependencies with `npm install`
 - Create a config.json in the same directory you will be running this script from.
   - Config file must include the required fields, if you create the config.json with `{}`, and run the main script, it will error out and inform you of which fields are missing or incorrect.
 - Run the main script `npm run start`

### TODO
 - Web UI improvements
   - Save step progress in localStorage
   - Server config file with certain fields hardcoded / not shown on the GUI
   - GUI "modes" for "admin" vs "customer"
     - Admin mode should allow advanced features like saving the updates config file on server side
     - Client mode should restrict certain features / fields
 - More background video / audio sources instead of JUST YouTube (open an issue to suggest a source)
 - More TTS service options (open an issue to suggest a service)
 - More AI service options (open an issue to suggest a service)

### Nice to have
 - Translate story
   - Google Translate
   - OpenAI
   - (open an issue to suggest a source)
 - Caption effects
   - grow / shrink
   - rotate
   - (open an issue to suggest other effects)