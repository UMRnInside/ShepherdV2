function cscan(bot, sheepConfig) {
    let scheduler = {};
    scheduler.minY = sheepConfig.minY;
    scheduler.maxY = sheepConfig.maxY;
    scheduler.yMultiplier = sheepConfig.schedulerConfig.yDistanceMultiplier;
    scheduler.stepping = sheepConfig.schedulerConfig.yStepping;
    scheduler.servesPerStep = sheepConfig.schedulerConfig.servesPerStep;

    scheduler.served = 0;
    scheduler.expectedY = scheduler.minY;
    scheduler.getCostToEntity = function(entity) {
        let tmp = Math.abs(scheduler.expectedY - entity.position.y);
        tmp *= scheduler.yMultiplier;
        return bot.entity.position.xzDistanceTo(entity.position) + tmp;
    };
    scheduler.onServed = function() {
        scheduler.served += 1;
        if (scheduler.served >= scheduler.servesPerStep) {
            scheduler.expectedY += scheduler.stepping;
            scheduler.served = 0;
        }
        if (scheduler.expectedY > scheduler.maxY) {
            scheduler.expectedY = scheduler.minY;
        }
        if (sheepConfig.schedulerConfig.debug) {
            console.log("CSCAN:", scheduler);
        }
    }
    return scheduler;
}

module.exports = cscan;
