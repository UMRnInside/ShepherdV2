function defaultDist(bot, entity) {
    const yPenalty = 10000.0;
    let tmp = bot.entity.position.y - entity.position.y;
    tmp = Math.abs(tmp) * yPenalty;
    return tmp + bot.entity.position.xzDistanceTo(entity.position);
}

function isPossiblyStucked(bot, entityPosition) {
    // Only block.boundingBox is required
    let blockPosition = entityPosition.floored();
    let block = bot.blockAt(blockPosition, false);
    if (!block) return false;
    // Note: prismarine-block may alter block.boundingBox definition
    return block.boundingBox === "block";
}

function getSheepIndexes(version) {
    // https://wiki.vg/Entity_metadata#Sheep
    function getBabyIndex(version) {
        if (version['<=']("1.12.2"))
            return 12;
        if (version['<=']("1.17.1"))
            return 15;
        return 16;
    }
    const isBabyIndex = getBabyIndex(version);
    const colorIndex = isBabyIndex + 1;
    return { isBabyIndex, colorIndex };
}

function findAvailableSheep(bot, woolMask) {
    let SheepMinX = bot.shepherd.config.sheep.minX;
    let SheepMaxX = bot.shepherd.config.sheep.maxX;
    let SheepMinZ = bot.shepherd.config.sheep.minZ;
    let SheepMaxZ = bot.shepherd.config.sheep.maxZ;
    let minY = bot.shepherd.config.sheep.minY;
    let maxY = bot.shepherd.config.sheep.maxY;
    const { isBabyIndex, colorIndex } = getSheepIndexes(bot.registry.version);

    let dist = defaultDist;
    if (bot.shepherd.scheduler) {
        dist = function(_bot, entity) {
            return bot.shepherd.scheduler.getCostToEntity(entity);
        }
    }

    function isInRange(l, x, r) {
        return l<=x && x<=r
    }
    let total = 0;
    let not_sheared = 0;

    let target = null;
    for (let key in bot.entities) {
        let entity = bot.entities[key];
        if (entity.displayName !== "Sheep")
            continue
        if (entity.metadata[isBabyIndex]) // Is baby, tested in 1.12.2
            continue

        if (!isInRange(SheepMinX, entity.position.x, SheepMaxX))
            continue
        if (!isInRange(SheepMinZ, entity.position.z, SheepMaxZ))
            continue
        if (!isInRange(minY, entity.position.y, maxY))
            continue
        total++;

        // Adapted for 1.8, change 13 to 16 in 1.9+?
        // 13 is for 1.12
        const sheep_info = entity.metadata[colorIndex];

        if (sheep_info & 16) // Sheared
            continue
        not_sheared++;

        // Unwanted color
        let match = (1 << (sheep_info & 0xF)) & woolMask;
        if (!match) {
            continue;
        }

        if (isPossiblyStucked(bot, entity.position)) {
            continue;
        }
        if (!target) {
            target = entity;
        } else if (dist(bot, entity) < dist(bot, target)) {
            target = entity;
        }
    }
    // console.log(total, "sheeps,", not_sheared, "shearable");
    // console.log(target.metadata)

    // Served a sheep
    if (bot.shepherd.scheduler) {
        bot.shepherd.scheduler.onServed();
    }
    return target;
}

function findDroppedWool(bot) {
    let SheepMinX = bot.shepherd.config.sheep.minX;
    let SheepMaxX = bot.shepherd.config.sheep.maxX;
    let SheepMinZ = bot.shepherd.config.sheep.minZ;
    let SheepMaxZ = bot.shepherd.config.sheep.maxZ;
    let minY = bot.shepherd.config.sheep.minY;
    let maxY = bot.shepherd.config.sheep.maxY;
    const mcData = bot.mcData ?? require('minecraft-data')(bot.version);

    let dist = defaultDist;
    if (bot.shepherd.scheduler) {
        dist = function(_bot, entity) {
            return bot.shepherd.scheduler.getCostToEntity(entity);
        }
    }

    function isInRange(l, x, r) {
        return l<=x && x<=r
    }

    let target = null;
    for (let key in bot.entities) {
        let entity = bot.entities[key];
        if (!entity.onGround)
            continue

        if (!isInRange(SheepMinX, entity.position.x, SheepMaxX))
            continue
        if (!isInRange(SheepMinZ, entity.position.z, SheepMaxZ))
            continue
        if (!isInRange(minY, entity.position.y, maxY))
            continue

        // in 1.15.2 and 1.12.2
        if (entity.displayName !== "Item" && entity.displayName !== "Dropped item")
            continue
        if (bot.supportFeature("itemsAreAlsoBlocks")) {
            // Tested 1.12.2
            let itemMetadata = entity.metadata[6];
            if (!itemMetadata || (itemMetadata.blockId ?? -1) !== mcData.itemsByName.wool.id)
                continue;
        } else {
            const whiteWoolId = mcData.itemsByName.white_wool.id;
            const blackWoolId = mcData.itemsByName.black_wool.id;
            let itemId = null;
            for (let candidate of entity.metadata) {
                if (candidate?.itemId) {
                    itemId = candidate.itemId;
                    break;
                }
            }
            if (itemId === null) continue;
            if (itemId < whiteWoolId || itemId > blackWoolId)
                continue;
        }

        if (isPossiblyStucked(bot, entity.position)) {
            continue;
        }
        if (target === null) {
            target = entity;
        } else if (dist(bot, entity) < dist(bot, target)) {
            target = entity;
        }
    }
    // Picking dropped wool serves no sheep, so we don't call onServe()
    return target;
}

module.exports = {
    findAvailableSheep,
    findDroppedWool
}
