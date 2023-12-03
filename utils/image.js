const Canvas = require('canvas');
const Path = require('path');

const { listFiles } = require('./fs');
const { fontsDir } = require('./dirs');

function fromText(text, config) {
    if(!config.height || !config.width){
        throw new Error("`height` and `width` are required fields!")
    }
    const canvas = Canvas.createCanvas(config.width, config.height);
    const ttfFiles = listFiles(fontsDir).filter(f=>f.toLowerCase().endsWith('.ttf'));
    for(const ttfFile of ttfFiles){
        const family = Path.basename(ttfFile);
        Canvas.registerFont(ttfFile, { family });
    }
    const context = canvas.getContext('2d');

    // Set background color
    context.fillStyle = config.background_color || 'rgba(0, 0, 0, 0)';
    context.fillRect(0, 0, config.width, config.height);

    // Set text style
    context.fillStyle = config.text_color || 'white';
    context.strokeStyle = config.text_stroke_color || 'black';
    context.lineWidth = config.text_stroke_width || 5;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = `${config.text_size || 50}px "${config.text_font || 'Roboto-Regular'}"`;

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

        if (testWidth > (config.width - (2 * (config.line_padding_width || 200)))) {
            lines.push(currentLine);
            currentLine = words[i];
        } else {
            currentLine = testLine;
        }
    }
    lines.push(currentLine);

    // Drawing text
    const lineHeight = maxHeight + (config.line_padding_height || 10); // Adjust line height as needed
    const startingY = config.height / 2 - (lines.length * lineHeight) / 2;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        context.strokeText(line, config.width / 2, startingY + i * lineHeight);
        context.fillText(line, config.width / 2, startingY + i * lineHeight);
    }

    // Save or process the canvas
    const buffer = canvas.toBuffer('image/png');
    // You can save this buffer as a file or return it
    return buffer;
}

exports = module.exports = {
    fromText
}