import winkNLP from 'wink-nlp';
import model from 'wink-eng-lite-web-model';
const wink = winkNLP(model);
import natural from 'natural';
import compromise from 'compromise';

// TODO: possibly support a hacked together version of `spacy` (python)
export async function split(text: string, useNLP='compromise') {
  if (useNLP == 'natural') {
    const tokenizer = new natural.SentenceTokenizer();
    return tokenizer.tokenize(text);
  } else if (useNLP == 'compromise') {
    const { docs } = compromise.tokenize(text);
    return docs.map((words) => words.map((word) => word.pre + word.text + word.post).join('').trim());
  } else if (useNLP == 'wink') {
    const doc = wink.readDoc(text);
    return doc.sentences().out();
  } else {
    throw new Error('Invalid NLP splitter!');
  }
}
