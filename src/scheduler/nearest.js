function noop(bot, sheepConfig) {
    let scheduler = {};
    scheduler.getCostToEntity = function(entity) {
        return bot.entity.position.manhattanDistanceTo(entity.position);
    };
    scheduler.onServed = function() {
        // No-op
    };
    return scheduler;
}

module.exports = noop;
