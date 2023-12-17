import { generateVideo } from './generator';
import { startServer } from './gui';
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
    .option('-p, --port <number>', 'Port number to start the server on', parseInt, 8443)
    .option('--ssl <true|false>', 'Start the server using SSL. Uses a self-signed localhost certificate if --ssl-key and --ssl-cert are not provided.', ((s) => ['1', 't', 'y'].includes(s[0].toLowerCase())), true)
    .option('--ssl-key <file>', 'Private key to use with the SSL server')
    .option('--ssl-cert <file>', 'Public certificate to use with the SSL server')
    .option('--no-https-redirect', 'Disable the https redirection when running an SSL server')
    .action((options) => {
      return startServer(options.port, options.ssl, options.httpsRedirect, options.sslKey, options.sslCert);
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

