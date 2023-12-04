import { default as colors } from 'colors';

export type ProgressBarOptions = {
  stream?: NodeJS.WriteStream,
  total: number,
  clearProgressOnComplete?: boolean,
  finishFormat?: string,
  curr?: number,
  width?: number,
  clear?: boolean,
  complete?: string,
  incomplete?: string,
  head?: string,
  renderThrottle?: number,
  callback?: (bar: ProgressBar) => void
}

/**
 * ProgressBar class
 */
export class ProgressBar {
  private stream: NodeJS.WriteStream;
  private fmt: string;
  private clearProgressOnComplete: boolean;
  private finishFmt: string;
  private curr: number;
  private total: number;
  private width: number;
  private clear: boolean;
  private chars: { complete: string, incomplete: string, head: string };
  private renderThrottle: number;
  private lastRender: number;
  private callback: (bar: ProgressBar) => void;
  private tokens: Record<string, string>;
  private lastDraw: string;
  private start: number | null;

  constructor(fmt: string, options: ProgressBarOptions | number) {
    this.stream = (typeof options !== 'number' ? options.stream : undefined) || process.stderr;
    this.start = null;

    if (typeof options === 'number') {
      options = { total: options };
    }

    if (typeof fmt !== 'string') throw new Error('format required');
    if (typeof options.total !== 'number') throw new Error('total required');

    this.fmt = fmt;
    this.clearProgressOnComplete = options.clearProgressOnComplete ?? false;
    this.finishFmt = options.finishFormat || fmt;
    this.curr = options.curr || 0;
    this.total = options.total;
    this.width = options.width || this.total;
    this.clear = options.clear ?? false;
    this.chars = {
      complete: options.complete || '=',
      incomplete: options.incomplete || '-',
      head: options.head || (options.complete || '='),
    };
    this.renderThrottle = options.renderThrottle !== 0 ? (options.renderThrottle || 16) : 0;
    this.lastRender = -Infinity;
    this.callback = options.callback || function() {};
    this.tokens = {};
    this.lastDraw = '';
  }

  static defaultWithLabel(label: string, extraOptions: Record<string, unknown> = {}): ProgressBar {
    const bar = new this(`${label} :bar ${colors.magenta(':percent')} ${colors.cyan(':eta')}`, {
      complete: colors.magenta('━'),
      incomplete: colors.grey('━'),
      head: colors.magenta('╸'),
      total: 100,
      width: process.stderr.columns,
      // @ts-ignore
      finishFormat: `${label} :bar ${colors.magenta('100%')} ${colors.brightYellow(':elapsed')}`,
      clearProgressOnComplete: true,
      ...extraOptions,
    });
    return bar;
  }

  tick(len: number, tokens?: Record<string, string>) {
    if (len !== 0 && !len) {
      len = 1;
    }

    if (tokens) {
      this.tokens = tokens;
    }

    if (this.curr === 0) {
      this.start = new Date().getTime();
    }

    this.curr += len as number;

    this.render();

    if (this.curr >= this.total) {
      if (this.clearProgressOnComplete) {
        this.curr = 0;
      }
      this.fmt = this.finishFmt;
      this.render(undefined, true);
      this.terminate();
      this.callback(this);
    }
  }

  render(tokens?: Record<string, string>, force: boolean = false) {
    if (tokens) {
      this.tokens = tokens;
    }

    if (!this.stream.isTTY) {
      return;
    }

    const now = Date.now();
    const delta = now - this.lastRender;
    if (!force && delta < this.renderThrottle) {
      return;
    } else {
      this.lastRender = now;
    }

    let ratio = this.curr / this.total;
    ratio = Math.min(Math.max(ratio, 0), 1);

    const percent = Math.floor(ratio * 100);
    const elapsed = new Date().getTime() - (this.start || 0);
    const eta = percent === 100 ? 0 : elapsed * (this.total / this.curr - 1);
    const rate = this.curr / (elapsed / 1000);

    let str = this.fmt
        .replace(':current', this.curr.toString())
        .replace(':total', this.total.toString())
        .replace(':elapsed', isNaN(elapsed) ? '0.0' : ProgressBar.toHHMMSS((elapsed / 1000).toFixed(1)))
        .replace(':eta', (isNaN(eta) || !isFinite(eta)) ? '--:--:--' : ProgressBar.toHHMMSS((eta / 1000).toFixed(1)))
        .replace(':percent', percent.toFixed(0) + '%')
        .replace(':rate', Math.round(rate).toString());

    let availableSpace = Math.max(0, this.stream.columns - str.replace(':bar', '').length);
    if (availableSpace && process.platform === 'win32') {
      availableSpace -= 1;
    }

    const width = Math.min(this.width, availableSpace);

    const completeLength = Math.round(width * ratio);
    let complete = Array(Math.max(0, completeLength + 1)).join(this.chars.complete);
    const incomplete = Array(Math.max(0, width - completeLength + 1)).join(this.chars.incomplete);

    if (completeLength > 0) {
      complete = complete.slice(0, -1) + this.chars.head;
    }

    str = str.replace(':bar', complete + incomplete);

    if (this.tokens) {
      for (const [key, val] of Object.entries(this.tokens)) {
        str = str.replace(':' + key, val);
      }
    }

    if (this.lastDraw !== str) {
      this.stream.cursorTo(0);
      this.stream.write(str);
      this.stream.clearLine(1);
      this.lastDraw = str;
    }
  }

  update(ratio: number, tokens?: Record<string, string>) {
    const goal = Math.floor(ratio * this.total);
    const delta = goal - this.curr;

    this.tick(delta, tokens);
  }

  interrupt(message: string) {
    this.stream.clearLine(0);
    this.stream.cursorTo(0);
    this.stream.write(message);
    this.stream.write('\n');
    this.stream.write(this.lastDraw);
  }

  terminate() {
    if (this.clear) {
      if (this.stream.clearLine) {
        this.stream.clearLine(0);
        this.stream.cursorTo(0);
      }
    } else {
      this.stream.write('\n');
    }
  }

  private static toHHMMSS(secs: string) {
    const secNum = parseInt(secs, 10);
    const hours = Math.floor(secNum / 3600);
    const minutes = Math.floor(secNum / 60) % 60;
    const seconds = secNum % 60;

    return [hours, minutes, seconds]
        .map((v) => v < 10 ? '0' + v : v)
        .join(':');
  }
}
