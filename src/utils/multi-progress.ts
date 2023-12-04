import { ProgressBar as Progress, ProgressBarOptions } from './progress';

type ProgressWithOriginals = Progress & {
  oupdate?: (ratio: number, tokens?: Record<string, string>) => void,
  otick?: (len: number, tokens?: Record<string, string>) => void,
  oterminate?: () => void,
}

export class MultiProgress {
  private stream: NodeJS.WriteStream;
  private isTTY: boolean;
  private cursor: number;
  private bars: ProgressWithOriginals[];
  private terminates: number;

  constructor(stream?: NodeJS.WriteStream) {
    this.stream = stream || process.stderr;
    this.isTTY = this.stream.isTTY;

    this.cursor = 0;
    this.bars = [];
    this.terminates = 0;
  }

  addBar(bar: ProgressWithOriginals): Progress {
    this.bars.push(bar);
    const index = this.bars.length - 1;

    this.move(index);
    if (this.isTTY) {
      this.stream.write('\n');
    }
    this.cursor += 1;

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
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
    bar.update = function(value, options) {
      self.update(index, value, options);
    };

    return bar;
  }

  newDefaultBarWithLabel(label: string, extraOptions: Record<string, unknown> = {}): Progress {
    const bar = Progress.defaultWithLabel(label, { ...extraOptions, stream: this.stream });
    return this.addBar(bar);
  }

  newBar(schema: string, options: ProgressBarOptions): Progress {
    options.stream = this.stream;
    const bar = new Progress(schema, options);
    return this.addBar(bar);
  }

  terminate(): void {
    this.move(this.bars.length);
    if (this.isTTY) {
      this.stream.clearLine(0);
      this.stream.cursorTo(0);
    }
  }

  move(index: number): void {
    if (this.isTTY) {
      this.stream.moveCursor(0, index - this.cursor);
    }
    this.cursor = index;
  }

  tick(index: number, value: number, options: Record<string, string>): void {
    const bar = this.bars[index];
    if (bar) {
      this.move(index);
      bar.otick(value, options);
    }
  }

  update(index: number, value: number, options: Record<string, string>): void {
    const bar = this.bars[index];
    if (bar) {
      this.move(index);
      bar.oupdate(value, options);
    }
  }
}
