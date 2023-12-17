import { generateVideo } from './generator';
import { loadConfig } from './utils/config';

const config = loadConfig();

generateVideo(config);
