const winkNLP = require('wink-nlp');
const model = require('wink-eng-lite-web-model');
const wink = winkNLP(model);
const natural = require('natural');
const compromise = require('compromise');

const { loadConfig } = require('./config');
const config = loadConfig();
// TODO: possibly support a hacked together version of `spacy` (python)
async function split(text){
    const useNLP = config.captions.nlp_splitter;
    if(useNLP == 'natural'){
        const tokenizer = new natural.SentenceTokenizer();
        return tokenizer.tokenize(text);
    } else if (useNLP == 'compromise'){
        const { docs } = compromise.tokenize(text);
        return docs.map(words => words.map(word => word.pre + word.text + word.post).join('').trim())
    } else if (useNLP == 'wink'){
        const doc = wink.readDoc(text);
        return doc.sentences().out();
    }
}

exports = module.exports = {
    split
}