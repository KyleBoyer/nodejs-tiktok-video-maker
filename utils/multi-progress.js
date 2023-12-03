const Progress = require('./progress');

// from https://gist.github.com/nuxlli/b425344b92ac1ff99c74
// with some modifications & additions

const mockBar = {
  tick() {},
  terminate() {},
  update() {},
  render() {},
};

const mockInstance = {
  newBar() {
    return mockBar;
  },
  terminate() {},
  move() {},
  tick() {},
  update() {},
  isTTY: false,
};

exports = module.exports = class MultiProgress {
  constructor(stream) {
    this.stream = stream || process.stderr;
    this.isTTY = this.stream.isTTY;

    if (!this.isTTY) {
      return mockInstance;
    }
    
    this.cursor = 0;
    this.bars = [];
    this.terminates = 0;
  
    return this;
  }
  addBar(bar){
    this.bars.push(bar);
    var index = this.bars.length - 1;

    // alloc line
    this.move(index);
    this.stream.write('\n');
    this.cursor += 1;

    // replace original
    var self = this;
    bar.otick = bar.tick;
    bar.oterminate = bar.terminate;
    bar.oupdate = bar.update;
    bar.tick = function(value, options) {
      self.tick(index, value, options);
    };
    bar.terminate = function() {
      self.terminates += 1;
      if (self.terminates === self.bars.length) {
        self.terminate();
      }
    };
    bar.update = function(value, options){
      self.update(index, value, options);
    };

    return bar;
  }
  newDefaultBarWithLabel(label, extraOptions = {}){
    var bar = Progress.defaultWithLabel(label, { ...extraOptions, stream: this.stream })
    return this.addBar(bar);
  }
  newBar(schema, options) {
    options.stream = this.stream;
    var bar = new Progress(schema, options);
    return this.addBar(bar);
  }

  terminate() {
    this.move(this.bars.length);
    this.stream.clearLine();
    this.stream.cursorTo(0);
  }

  move(index) {
    this.stream.moveCursor(0, index - this.cursor);
    this.cursor = index;
  }

  tick(index, value, options) {
    const bar = this.bars[index];
    if (bar) {
      this.move(index);
      bar.otick(value, options);
    }
  }

  update(index, value, options) {
    const bar = this.bars[index];
    if (bar) {
      this.move(index);
      bar.oupdate(value, options);
    }
  }
}