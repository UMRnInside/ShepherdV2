const mineflayer = require('mineflayer');
const watchdog = require('mineflayer-simple-watchdog');
const sheeputil = require('./utils/sheeputil');
const inventory = require('./utils/inventory');
const chatControl = require('./chatcontrol');
const schedulers = require('./scheduler/scheduler');
const GoalNearXZY = require('./utils/GoalNearXzy');
const Vec3 = require('vec3');
const { pathfinder, Movements, goals: { GoalNear, GoalFollow } } = require('mineflayer-pathfinder');

function makeShepherd(host, port, username, password, config) {
    let bot = mineflayer.createBot({
        host: host,
        port: port,
        username: username,
        password: password,
        version: config.version,
        viewDistance: config.viewDistance ?? 6,
        defaultChatPatterns: false,
        watchdogConfig: {
            timeout: config.watchdog.timeout ?? 30000,
            resetAction: onTimeout 
        }
    });
    function onTimeout() {
        console.log("Watchdog reset action")
        if (config.watchdog.resetAction === "quit") {
            bot.quit();
        } else if (config.watchdog.resetAction === "disconnect") {
            bot.end();
        } else {
            Reset();
        }
    }
    function onCollect(collector, collected) {
        if (collector.username === bot.username) {
            console.log("Item collected.");
            bot.watchdog.kick();
        }
    }

    bot.loadPlugin(watchdog);
    bot.loadPlugin(pathfinder);
    bot.pathfinder.thinkTimeout = 30000;
    bot.on("playerCollect", onCollect);

    bot.shepherd = {};
    // Note: reload scheduler when bot is reloaded
    let schedulerFactory = schedulers[config.sheep.scheduler];
    if (!schedulerFactory) {
        console.log(`Error: invalid scheduler '${config.sheep.scheduler}'`);
        console.log(`Scheduler must be one of '${Object.keys(schedulers)}'`);
        return null;
    }
    bot.shepherd.scheduler = schedulerFactory(bot, config.sheep);

    chatControl.addChatControl(bot, config.chatControl);

    bot.shepherd.config = config;
    bot.shepherd.hasOngoingReset = false;
    bot.shepherd.workloop = async function() {
        await shepherdWorkloop(bot);
    }
    bot.shepherd.reset = async function() {
        await Reset(bot);
    };

    bot.shepherd.working = false;

    bot.once('spawn', async () => {
        console.log("first spawn");
        const mcData = require("minecraft-data")(bot.version);
        const defaultMove = new Movements(bot, mcData);
        defaultMove.allow1by1towers = false;
        defaultMove.canDig = false;
        defaultMove.allowParkour = true;
        defaultMove.allowSprinting = true;
        bot.pathfinder.setMovements(defaultMove);
        bot.mcData = mcData;

        await bot.waitForTicks(10);
        for (let i in config.login.sequence) {
            bot.chat(config.login.sequence[i]);
            await bot.waitForTicks(config.login.gapTicks);
        }
        if (!config.sheep.autostart) return;
        bot.shepherd.working = true;
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

async function botGoto(bot, position, xzRange) {
    const vec = Vec3(position);
    let goal = new GoalNearXZY(vec.x, vec.y, vec.z, xzRange, 1.0);
    try {
        await bot.pathfinder.goto(goal);
        return true;
    } catch (err) {
        if (err.name === 'GoalChanged') {
            return false;
        }
        // ignore false-positive NoPath results 
        if (err.name === 'NoPath') {
            console.log("Warning: NoPath");
            console.log(bot.entity.position);
            console.log(vec);
            return false;
        }
        console.log(vec);
        console.log(err);
        bot.pathfinder.stop();
    }
    return false;
}

async function storeWools(bot) {
    let config = bot.shepherd.config;
    let standingPosition = Vec3(config.storage.standingPosition);
    let lookPosition = Vec3(config.storage.lookAt);
    bot.watchdog.kick();
    try {
        await botGoto(bot, standingPosition, 0.1);
        await bot.lookAt(lookPosition);
        let woolCount = inventory.countWools(bot);
        if (config.storage.useChests) {
            const chest = await bot.openContainer(bot.blockAt(lookPosition));
            console.log(`Depositing ${woolCount} wools...`);
            // TODO: faster depositing
            // chest.deposit() stucks on spigot w/ NCP
            let slots = chest.slots;
            let chestEmptySlot = 0;
            for (let i = chest.inventoryStart;i<=chest.inventoryEnd;i++) {
                if (!slots[i]) continue;
                if (!inventory.itemIsWool(bot, slots[i])) continue;
                while (slots[chestEmptySlot] 
                    && chestEmptySlot < chest.inventoryStart) chestEmptySlot++;
                await bot.moveSlotItem(i, chestEmptySlot);
                console.log(`Moved ${i} -> ${chestEmptySlot}`);
                bot.watchdog.kick();
                await bot.waitForTicks(4);
            }
            chest.close();
        } else {
            console.log(`Tossing ${woolCount} wools...`);
            // TODO: faster tossing
            const items = bot.inventory.items();
            for (let i in items) {
                if (!inventory.itemIsWool(bot, items[i])) continue;
                await bot.tossStack(items[i]);
                await bot.waitForTicks(4);
            }
        }
    } catch (err) {
        console.log(err);
    }
    bot.watchdog.kick();
}

async function takeOneShears(bot) {
    let config = bot.shepherd.config;
    const mcData = bot.mcData;
    bot.watchdog.kick();
    await botGoto(bot, config.shears.standingPosition, 0);
    await bot.lookAt(Vec3(config.shears.chestPosition));
    await bot.unequip("hand");
    bot.watchdog.kick();
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
    while (inventory.countItemById(bot, mcData.itemsByName.shears.id) <= 0) {
        let success = await withdrawItem("shears", 1);
        if (success) break;
        await bot.waitForTicks(60);
    }
    chest.close();
    bot.watchdog.kick();
}

async function shepherdWorkloop(bot) {
    bot.watchdog.start();
    console.log("Entering workloop");
    const maxRepeats = 25;
    const mcData = bot.mcData ?? require('minecraft-data')(bot.version);
    let lastSheep = null;
    let repeated = 0;

    while (bot.shepherd.working) {
        if (!bot.shepherd.working || bot.hasOngoingReset) return;

        let config = bot.shepherd.config;

        let shearsCount = inventory.countItemById(bot, mcData.itemsByName.shears.id);
        if (shearsCount <= 0) {
            console.log("Taking shears...");
            await takeOneShears(bot);
            await botGoto(bot, config.sheep.idlePosition, 1.0);
            continue;
        }
        // TODO: hardcoded wool item id
        let woolCount = inventory.countWools(bot);
        if (woolCount >= config.storage.maxWoolInsideInventory) {
            console.log("Storing wools...");
            await storeWools(bot);
            await botGoto(bot, config.sheep.idlePosition, 1.0);
            continue;
        }

        let droppedWool = sheeputil.findDroppedWool(bot, config);
        if (droppedWool) {
            console.log("Picking dropped wool...");
            await botGoto(bot, droppedWool.position, 0.5);
            continue;
        }
        let colormask = config.sheep.colormask;
        let sheep = sheeputil.findAvailableSheep(bot, colormask);
        if (!sheep) {
            lastSheep = null;
            // Go idle
            bot.watchdog.kick();
            await botGoto(bot, config.sheep.idlePosition, 1.0);
            continue;
        }
        if (sheep === lastSheep) {
            repeated += 1;
        } else {
            lastSheep = sheep;
            repeated = 0;
        }
        if (repeated > maxRepeats) {
            console.log("Desynchronization detected!");
            bot.watchdog.resetAction();
        }
        console.log("Found sheep at", sheep.position);

        let distance = bot.entity.position.distanceTo(sheep.position);
        while (distance > config.sheep.shearDistance) {
            console.log("Not near enough, approaching...")
            await botGoto(bot, sheep.position, config.sheep.shearDistance);
            distance = bot.entity.position.distanceTo(sheep.position);
        }
        bot.lookAt(sheep.position, true);
        // TODO: hardcoded item name "shears"
        await inventory.equipItem(bot, "shears", "hand");
        bot.useOn(sheep);
        console.log("Shearing");
        await bot.waitForTicks(2);
    }
}

async function Reset(bot) {
    if (bot.hasOngoingReset) return;
    console.log("Reset!");
    bot.watchdog.stop();
    bot.shepherd.hasOngoingReset = true;
    bot.shepherd.working = false;
    bot.pathfinder.stop();
    bot.clearControlStates();
    let config = bot.shepherd.config;
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
    bot.shepherd.working = true;
    shepherdWorkloop(bot);
}

module.exports = {
    makeShepherd
}
