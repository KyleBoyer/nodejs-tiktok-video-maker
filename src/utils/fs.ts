import { existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

export const ensureDir = (dirName: string) => {
  if (!existsSync(dirName)) {
    mkdirSync(dirName, {recursive: true});
  }
};

export const ensureDirs = (dirNames: string[] | string) => {
  const listOfDirs = Array.isArray(dirNames) ? dirNames : [dirNames];
  for (const dir of listOfDirs) {
    ensureDir(dir);
  }
};

export const listFiles = (dirName: string) => {
  if (!existsSync(dirName)) {
    return [];
  }
  const files = readdirSync(dirName);
  return files.map((file) => join(dirName, file));
};

export const generateValidFilename = (text: string, maxLength=256) => {
  const validChars = /[^a-zA-Z0-9-_]/g;
  return text.replace(validChars, '_').replace(/_{2,}/g, '_').substring(0, maxLength);
};

export const existsAndHasContent = (file: string) => {
  return existsSync(file) && statSync(file).size > 0;
};
