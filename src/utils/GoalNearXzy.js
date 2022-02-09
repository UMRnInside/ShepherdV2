const goals = require('mineflayer-pathfinder').goals;

class GoalNearXZY extends goals.Goal {
    constructor(x, y, z, xzRange, yRange) {
        super();
        this.x = Math.floor(x);
        this.y = Math.floor(y);
        this.z = Math.floor(z);
        this.xzRange2 = xzRange * xzRange;
        this.yRange = yRange;
    }

    heuristic(node) {
        const dx = this.x - node.x;
        const dy = this.y - node.y;
        const dz = this.z - node.z;
        return (dx*dx + dz*dz) + Math.abs(dy);
    }

    isEnd(node) {
        const dx = this.x - node.x;
        const dy = this.y - node.y;
        const dz = this.z - node.z;
        return (dx*dx + dz*dz <= this.xzRange2) && (Math.abs(dy) <= this.yRange);
    }
}

module.exports = GoalNearXZY;
