const OpenAIUtil = require('./openai');

class AIUtil {
    constructor(config){
        this.config = config;
        this.openai = new OpenAIUtil(config);
    }

    async rewordStory(originalStory){
        return this.openai.rewordStory(originalStory);
    }
    async generateNewStory(){
        return this.openai.generateNewStory();
    }
}

exports = module.exports = AIUtil;