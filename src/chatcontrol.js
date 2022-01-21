const inventory = require('./utils/inventory');

function addChatPatterns(bot, config) {
    let patterns = config.whisperPatterns;
    for (let i in patterns) {
        bot.addChatPattern('whisper', RegExp(patterns[i]));
    }
}

function addChatControl(bot, config) {
    function isOwner(username) {
        for (let i in config.owners) {
            if (username === config.owners[i]) return true;
        }
        return false;
    }
    addChatPatterns(bot, config);
    bot.on('whisper', async (username, message) => {
        if (username === bot.username) return;
        if (config.allowOwnersOnly && !isOwner(username)) {
            return;
        }
        switch (true) {
            case /^(say|chat) (.*)$/.test(message):
                let match = /^(say|chat) (.*)$/.exec(message);
                bot.chat(match[2]);
                break;
            case /^reset$/.test(message):
                bot.whisper(username, "Reseting...");
                await bot.shepherdReset();
                break;
            case /^quit$/.test(message):
                bot.quit();
                break;
            case /^listitems$/.test(message):
                inventory.sayItems(bot);
                break;
            case /^stop$/.test(message):
                bot.shepherdWorking = false;
                bot.whisper(username, "Stopping...");
                break;
            case /^start$/.test(message):
                if (!bot.shepherdWorking) {
                    bot.whisper(username, "Starting...");
                    await bot.waitForTicks(60);
                    bot.whisper(username, "Entering workloop...");
                    bot.shepherdWorking = true;
                    bot.shepherdWorkloop();
                } else {
                    bot.whisper(username, "Bot is already working!");
                }
                break;
            case /^count$/.test(message):
                let woolCount = inventory.countItemById(bot, 35);
                let shearsCount = inventory.countItemById(bot, 359);
                bot.whisper(username, `${woolCount} wools, ${shearsCount} shears.`);
                break;
            case /^dumpShears$/.test(message):
                console.log("first shear:", inventory.itemByName(bot, "shears"));
                break;
        }
    });
}



module.exports = {
    addChatControl
};
