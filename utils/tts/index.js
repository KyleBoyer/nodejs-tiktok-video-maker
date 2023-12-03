const tiktok = require('./tiktok')

async function generate(text){
    return tiktok.generate(text);
}

exports = module.exports = {
    generate
}