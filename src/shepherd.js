const mineflayer = require('mineflayer');
const sheeputil = require('./utils/sheeputil');
const inventory = require('./utils/inventory');
const Vec3 = require('vec3');
const { pathfinder, Movements, goals: { GoalNear } } = require('mineflayer-pathfinder');

function makeShepherd(host, port, username, password, config) {
    let bot = mineflayer.createBot({
        host: host,
        port: port,
        username: username,
        password: password,
        version: config.version 
    });
    bot.loadPlugin(pathfinder);

    bot.shepherdConfig = config;
    bot.shepherdWorking = false;

    bot.once('spawn', async () => {
        const mcData = require("minecraft-data")(bot.version);
        const defaultMove = new Movements(bot, mcData);
        defaultMove.allow1by1towers = false;
        defaultMove.canDig = false;
        defaultMove.allowParkour = true;
        defaultMove.allowSprinting = false;
        bot.pathfinder.setMovements(defaultMove);

        await bot.waitForTicks(10);
        for (let i in config.login.sequence) {
            bot.chat(config.login.sequence[i]);
            await bot.waitForTicks(config.login.gapTicks);
        }
        bot.shepherdWorking = true;
        shepherdWorkloop(bot);
    });
    return bot;
}

async function botGoto(bot, position, range) {
    let goal = new GoalNear(position.x, position.y, position.z, range);
    await bot.pathfinder.goto(goal);
}

async function storeWools(bot, woolCount) {
    let config = bot.shepherdConfig;
    let standingPosition = Vec3(config.storage.standingPosition);
    let lookPosition = Vec3(config.storage.lookAt);
    await botGoto(bot, standingPosition, 1.0);
    await bot.lookAt(lookPosition);
    // TODO: hardcoded wool item id: 35
    await bot.toss(35, null, woolCount);
}

async function shepherdWorkloop(bot) {
    while (bot.shepherdWorking) {
        await bot.waitForTicks(10);
        let config = bot.shepherdConfig;

        // TODO: hardcoded wool item id
        let woolCount = inventory.countItemById(bot, 35);
        if (woolCount >= config.storage.maxWoolInsideInventory) {
            await storeWools(bot, woolCount);
            await botGoto(bot, config.sheep.idlePosition, 1.0);
            continue;
        }

        let droppedWool = sheeputil.findDroppedWool(bot, config);
        if (droppedWool) {
            await botGoto(bot, droppedWool.position, 1.0);
            continue;
        }
        let colormask = config.sheep.colormask;
        let sheep = sheeputil.findAvailableSheep(bot, colormask);
        if (!sheep) {
            // Go idle
            await botGoto(bot, config.sheep.idlePosition, 1.0);
            continue;
        }
        // TODO: hardcoded range 1.0
        await botGoto(bot, sheep.position, 1.0);
        await bot.lookAt(sheep.position);
        // TODO: hardcoded item name "shears"
        await inventory.equipItem(bot, "shears", "hand");
        bot.useOn(sheep);
    }
}

module.exports = {
    makeShepherd
}
