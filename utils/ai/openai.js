const splitter = require('../splitter');

class OpenAIUtil {
    constructor(config){
        this.config = config;
        const openaiKey = config.story.source.openai_api_key;
    }

    async rewordStory(originalStory){
        // TODO
        return originalStory;
    }
    async generateNewStory(){
        const prompt = this.config.story.source.prompt;
        // TODO
        return {
            title: 'Not implemented',
            content: 'This function is not implemented yet',
            folder: 'openai'
        }
    }
}

exports = module.exports = OpenAIUtil;