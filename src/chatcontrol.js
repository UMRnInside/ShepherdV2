const inventory = require('./utils/inventory');

function addChatPatterns(bot, config) {
    let patterns = config.whisperRegexPatterns;
    for (let i in patterns) {
        console.log(RegExp(patterns[i]));
        bot.addChatPattern('whisper', RegExp(patterns[i]), {parse: true, deprecated: true} );
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
    // Wrapper of 'whisper' event
    // See https://github.com/PrismarineJS/mineflayer/issues/2478
    bot.on('whisper', async (username, message) => {
        console.log("(Whisper)", username, message);
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
                await bot.shepherd.reset();
                break;
            case /^quit$/.test(message):
                bot.quit();
                break;
            case /^listitems$/.test(message):
                inventory.sayItems(bot);
                break;
            case /^stop$/.test(message):
                bot.shepherd.working = false;
                bot.watchdog.stop();
                bot.whisper(username, "Stopping...");
                break;
            case /^start$/.test(message):
                if (!bot.shepherd.working) {
                    bot.whisper(username, "Starting...");
                    await bot.waitForTicks(60);
                    bot.whisper(username, "Entering workloop...");
                    bot.shepherd.working = true;
                    bot.shepherd.workloop();
                } else {
                    bot.whisper(username, "Bot is already working!");
                }
                break;
            case /^dumpShears$/.test(message):
                console.log("first shear:", inventory.itemByName(bot, "shears"));
                break;
            case /^setmask \d+/.test(message):
                let match = /^setmask (\d+)$/.exec(message);
                let mask = parseInt(match[1], 10);
                bot.shepherd.config.sheep.colormask = mask;
                console.log(`Wool color mask set: ${mask}`);
                break;
            case /^getmask/.test(message):
                bot.chat(`${bot.shepherd.config.sheep.colormask}`);
                break;
        }
    });
}



module.exports = {
    addChatControl
};
