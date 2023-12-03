const Canvas = require('canvas');
const Path = require('path');

const { listFiles } = require('./fs');
const { fontsDir } = require('./dirs')
const { loadConfig } = require('./config');
const config = loadConfig();

function fromText(text, width=config.video.width, height=config.video.height) {
    const canvas = Canvas.createCanvas(width, height);
    const ttfFiles = listFiles(fontsDir).filter(f=>f.toLowerCase().endsWith('.ttf'));
    for(const ttfFile of ttfFiles){
        const family = Path.basename(ttfFile);
        Canvas.registerFont(ttfFile, { family });
    }
    const context = canvas.getContext('2d');

    // Set background color
    context.fillStyle = config.captions.background;
    context.fillRect(0, 0, width, height);

    // Set text style
    context.fillStyle = config.captions.color;
    context.strokeStyle = config.captions.stroke_color;
    context.lineWidth = config.captions.stroke_width;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = `${config.captions.font_size}px "${config.captions.font}"`;

    // Word wrapping
    const words = text.split(' ');
    const lines = [];
    let currentLine = words[0];
    let maxHeight = 0;
    for (let i = 1; i < words.length; i++) {
        let testLine = currentLine + ' ' + words[i];
        let metrics = context.measureText(testLine);
        maxHeight = Math.max(maxHeight, metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent)
        let testWidth = metrics.width;

        if (testWidth > (width - (2 * config.captions.line_padding.width))) {
            lines.push(currentLine);
            currentLine = words[i];
        } else {
            currentLine = testLine;
        }
    }
    lines.push(currentLine);

    // Drawing text
    const lineHeight = maxHeight + config.captions.line_padding.height; // Adjust line height as needed
    const startingY = height / 2 - (lines.length * lineHeight) / 2;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        context.strokeText(line, width / 2, startingY + i * lineHeight);
        context.fillText(line, width / 2, startingY + i * lineHeight);
    }

    // Save or process the canvas
    const buffer = canvas.toBuffer('image/png');
    // You can save this buffer as a file or return it
    return buffer;
}

exports = module.exports = {
    fromText
}