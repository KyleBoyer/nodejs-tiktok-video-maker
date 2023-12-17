import { generateVideo } from './generator';
import { loadConfig } from './utils/config';
import { Command } from 'commander';
const program = new Command();

program
    .name('nodejs-tiktok-video-maker')
    .description('Create Tiktok Videos with just ✨ one command ✨');
// .version('0.0.1');

program
    .command('server')
    .description('Start the GUI')
    .option('-p, --port <number>', 'Port number to start the server on', parseInt, 8080)
    .action((...args) => {
      console.log(args);
    });

program
    .command('generate', { isDefault: true })
    .description('Run video generation once')
    .option('-c, --config <file>', 'JSON config file to use', `${process.cwd()}/config.json`)
    .action((options) => {
      const config = loadConfig(options.config);
      return generateVideo(config);
    });


program.parse();

