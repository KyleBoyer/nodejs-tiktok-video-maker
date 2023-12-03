const fs = require('fs');
const Path = require('path');
const ensureDir = (dirName) => {
    if(!fs.existsSync(dirName)){
        fs.mkdirSync(dirName, {recursive: true});
    }
};
const ensureDirs = (dirNames) => {
    const listOfDirs = Array.isArray(dirNames) ? dirNames : [ dirNames ];
    for(const dir of listOfDirs){
        ensureDir(dir);
    }
}
const listFiles = (dirName) => {
    if(!fs.existsSync(dirName)){
        return [];
    }
    const files = fs.readdirSync(dirName);
    return files.map(file => Path.join(dirName, file));
}

const generateValidFilename = (text, maxLength=256) => {
    const validChars = /[^a-zA-Z0-9-_]/g;
    return text.replace(validChars, '_').replace(/_{2,}/,'_').substring(0, maxLength);
}
exports = module.exports = {
    ensureDir,
    ensureDirs,
    listFiles,
    generateValidFilename,
}