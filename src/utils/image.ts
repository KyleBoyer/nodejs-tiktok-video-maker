import Canvas from 'canvas';
import { parse } from 'path';

import { listFiles } from './fs';
import { fontsDir } from './dirs';
import { validateConfig } from './config';

export class ImageGenerator {
  config: ReturnType<typeof validateConfig>;
  constructor(config: ReturnType<typeof validateConfig>) {
    this.config = config;
  }
  async resize(old: string | Buffer) {
    const width = this.config.video.width;
    const height = this.config.video.height;
    const canvas = Canvas.createCanvas(width, height);
    const context = canvas.getContext('2d');
    // Set background color
    context.fillStyle = this.config.captions.background;
    context.fillRect(0, 0, width, height);
    const oldImg = await Canvas.loadImage(old);

    // Original dimensions
    const origWidth = oldImg.width;
    const origHeight = oldImg.height;

    // Calculate maximum scaling factor
    const padWidth = Math.max(origHeight, origWidth) == origWidth ? (this.config.captions.padding.width * 2) : 0;
    const scaleWidth = (width - padWidth) / origWidth;
    const padHeight = Math.max(origHeight, origWidth) == origHeight ? (this.config.captions.padding.height * 2) : 0;
    const scaleHeight = (height - padHeight) / origHeight;
    const scaleFactor = Math.min(scaleWidth, scaleHeight);

    // Calculate scaled dimensions
    const scaledWidth = origWidth * scaleFactor;
    const scaledHeight = origHeight * scaleFactor;
    context.drawImage(
        oldImg,
        ((width - scaledWidth) / 2),
        ((height - scaledHeight) / 2),
        scaledWidth,
        scaledHeight
    );
    const buffer = canvas.toBuffer('image/png');
    return buffer;
  }
  fromText(text: string) {
    const width = this.config.video.width;
    const height = this.config.video.height;
    const ttfFiles = listFiles(fontsDir).filter((f)=>f.toLowerCase().endsWith('.ttf'));
    for (const ttfFile of ttfFiles) {
      const family = parse(ttfFile).name;
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
      const testLine = currentLine + ' ' + words[i];
      const metrics = context.measureText(testLine);
      maxHeight = Math.max(maxHeight, metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent);
      const testWidth = metrics.width;

      if (testWidth > (width - (2 * this.config.captions.padding.width))) {
        lines.push(currentLine);
        currentLine = words[i];
      } else {
        currentLine = testLine;
      }
    }
    lines.push(currentLine);

    // Drawing text
    const lineHeight = maxHeight + this.config.captions.padding.height; // Adjust line height as needed
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
