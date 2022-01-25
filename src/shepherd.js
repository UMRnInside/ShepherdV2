const mineflayer = require('mineflayer');
const sheeputil = require('./utils/sheeputil');
const inventory = require('./utils/inventory');
const chatControl = require('./chatcontrol');
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
    bot.pathfinder.thinkTimeout = 30000;
    chatControl.addChatControl(bot, config.chatControl);

    bot.shepherdConfig = config;
    bot.hasOngoingReset = false;
    bot.shepherdWorkloop = async function() {
        await shepherdWorkloop(bot);
    }
    bot.shepherdReset = async function() {
        await Reset(bot);
    };

    bot.shepherdWorking = false;

    bot.once('spawn', async () => {
        console.log("first spawn");
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
        if (!config.sheep.autostart) return;
        bot.shepherdWorking = true;
        try {
            shepherdWorkloop(bot);
        } catch (err) {
            // mineflayer-pathfind.GoalChanged
            if (err.name !== 'GoalChanged') {
                console.log(err);
                Reset(bot);
            }
        }
    });
    return bot;
}

async function botGoto(bot, position, range) {
    const vec = Vec3(position);
    let goal = new GoalNear(vec.x, vec.y, vec.z, range);
    try {
        await bot.pathfinder.goto(goal);
    } catch (err) {
        if (err.name === 'GoalChanged') {
            return;
        }
        // ignore false-positive NoPath results 
        if (err.name === 'NoPath') {
            console.log("Warning: NoPath");
            console.log(vec);
            return;
        }
        console.log(vec);
        console.log(err);
        bot.pathfinder.stop();
    }
}

async function storeWools(bot) {
    let config = bot.shepherdConfig;
    let standingPosition = Vec3(config.storage.standingPosition);
    let lookPosition = Vec3(config.storage.lookAt);
    try {
        await botGoto(bot, standingPosition, 1.0);
        await bot.lookAt(lookPosition);
        // TODO: hardcoded wool item id: 35
        let woolCount = inventory.countItemById(bot, 35);
        console.log(`Tossing ${woolCount} wools...`);
        await bot.toss(35, null, woolCount);
    } catch (err) {
        console.log(err);
    }
}

async function takeOneShears(bot) {
    let config = bot.shepherdConfig;
    await botGoto(bot, config.shears.standingPosition, 0);
    await bot.lookAt(Vec3(config.shears.chestPosition));
    await bot.unequip("hand");
    const chestBlock = bot.blockAt(Vec3(config.shears.chestPosition));
    const chest = await bot.openContainer(chestBlock);
    // Copy-pasted from https://github.com/PrismarineJS/mineflayer/blob/master/examples/chest.js
    function itemByName (items, name) {
        let item
        for (let i in items) {
            item = items[i]
            if (item && item.name === name) return item
            console.log(item)
        }
        return null
    }
    async function withdrawItem (name, amount) {
        const item = itemByName(chest.containerItems(), name)
        if (item) {
            try {
                await chest.withdraw(item.type, null, amount)
                console.log(`withdrew ${amount} ${item.name}`)
                return true
            } catch (err) {
                console.log(`unable to withdraw ${amount} ${item.name}`)
                return false
            }
        } else {
            console.log(`unknown item ${name}`)
            return false
        }
    }
    // End of copy-pasted part
    // TODO: countItemById seems not working as expected
    while (inventory.countItemById(bot, 359) <= 0) {
        let success = await withdrawItem("shears", 1);
        if (success) break;
        await bot.waitForTicks(60);
    }
    chest.close();
}

async function shepherdWorkloop(bot) {
    console.log("Entering workloop");
    while (bot.shepherdWorking) {
        await bot.waitForTicks(10);
        if (!bot.shepherdWorking || bot.hasOngoingReset) return;

        let config = bot.shepherdConfig;

        // TODO: hardcoded shears item id
        let shearsCount = inventory.countItemById(bot, 359);
        if (shearsCount <= 0) {
            await takeOneShears(bot);
            await botGoto(bot, config.sheep.idlePosition, 1.0);
            continue;
        }
        // TODO: hardcoded wool item id
        let woolCount = inventory.countItemById(bot, 35);
        if (woolCount >= config.storage.maxWoolInsideInventory) {
            await storeWools(bot);
            await botGoto(bot, config.sheep.idlePosition, 1.0);
            continue;
        }

        let droppedWool = sheeputil.findDroppedWool(bot, config);
        if (droppedWool) {
            await botGoto(bot, droppedWool.position, 0.0);
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

async function Reset(bot) {
    if (bot.hasOngoingReset) return;
    console.log("Reset!");
    bot.hasOngoingReset = true;
    bot.shepherdWorking = false;
    bot.pathfinder.stop();
    bot.clearControlStates();
    let config = bot.shepherdConfig;
    await bot.waitForTicks(config.reset.gapTicks);
    for (let i in config.reset.sequence) {
        bot.chat(config.reset.sequence[i]);
        await bot.waitForTicks(config.reset.gapTicks);
    }
    bot.hasOngoingReset = false;
    if (config.reset.backToIdlePosition) {
        let idlePosition = Vec3(config.sheep.idlePosition);
        await botGoto(bot, idlePosition);
    }
    await bot.waitForTicks(20);
    bot.shepherdWorking = true;
    shepherdWorkloop(bot);
}

module.exports = {
    makeShepherd
}
