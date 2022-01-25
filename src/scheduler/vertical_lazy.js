function verticalLazy(bot, sheepConfig) {
    let scheduler = {};
    scheduler.yMultiplier = sheepConfig.schedulerConfig.yDistanceMultiplier;
    scheduler.getCostToEntity = function(entity) {
        let tmp = Math.abs(bot.entity.position.y - entity.position.y);
        tmp *= scheduler.yMmultiplier;
        return bot.entity.position.xzDistanceTo(entity.position) + tmp;
    };
    scheduler.onServed = function() {
        // No-op
    }
    return scheduler;
}

module.exports = verticalLazy;
