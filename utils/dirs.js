const Path = require('path');
const { ensureDirs } = require('./fs');

const fontsDir = Path.join(process.cwd(), 'fonts');
const assetDir = Path.join(process.cwd(), 'assets');
const outputDir = Path.join(assetDir, 'output');
const youtubeDir = Path.join(assetDir, 'youtube');
const redditDir = Path.join(assetDir, 'reddit');
const captionsDir = Path.join(assetDir, 'captions');
const ttsDir = Path.join(assetDir, 'tts');

ensureDirs([fontsDir, assetDir, outputDir, youtubeDir, redditDir, captionsDir, ttsDir]);

exports = module.exports = {
    fontsDir,
    assetDir,
    captionsDir,
    ttsDir,
    outputDir,
    youtubeDir,
    redditDir,
}