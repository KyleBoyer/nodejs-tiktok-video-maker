const Canvas = require('canvas');
const Path = require('path');

const { listFiles } = require('./fs');
const { fontsDir } = require('./dirs');

class ImageGenerator {
    constructor(config){
        this.config = config;
    }
    fromText(text) {
        const width = this.config.video.width;
        const height = this.config.video.height;
        const ttfFiles = listFiles(fontsDir).filter(f=>f.toLowerCase().endsWith('.ttf'));
        for(const ttfFile of ttfFiles){
            const family = Path.parse(ttfFile).name;
            Canvas.registerFont(ttfFile, { family });
        }
        const canvas = Canvas.createCanvas(width, height);
        const context = canvas.getContext('2d');
    
        // Set background color
        context.fillStyle = this.config.captions.background;
        context.fillRect(0, 0, width, height);
    
        // Set text style
        context.fillStyle = this.config.captions.color;
        context.strokeStyle = this.config.captions.stroke_color;
        context.lineWidth = this.config.captions.stroke_width;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.font = `${this.config.captions.font_size}px "${this.config.captions.font}"`;
    
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
    
            if (testWidth > (width - (2 * this.config.captions.line_padding.width))) {
                lines.push(currentLine);
                currentLine = words[i];
            } else {
                currentLine = testLine;
            }
        }
        lines.push(currentLine);
    
        // Drawing text
        const lineHeight = maxHeight + this.config.captions.line_padding.height; // Adjust line height as needed
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
}

exports = module.exports = ImageGenerator;