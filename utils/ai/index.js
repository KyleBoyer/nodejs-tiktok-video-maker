const openai = require('./openai');
async function rewordStory(originalStory){
    return openai.rewordStory(originalStory);;
}
async function generateNewStory(prompt){
    return openai.generateNewStory(prompt);
}
exports = module.exports = {
    generateNewStory,
    rewordStory,
}