const dynamicImport = new Function('specifier', 'return import(specifier)');
const importPromise = dynamicImport('escape-string-regexp');

export async function replace(text: string, replacements: [string, string][]=[]) {
  const { default: escapeStringRegexp } = await importPromise;
  let newText = text;
  for (const [oldWord, newWord] of replacements) {
    const re = new RegExp(`\\b${escapeStringRegexp(oldWord)}\\b`, 'gi');
    newText = newText.replace(re, (match) => {
      if (match[0].toUpperCase() == match[0]) {
        return newWord.charAt(0).toUpperCase() + newWord.slice(1);
      }
      return newWord;
    });
  }
  return newText;
}

