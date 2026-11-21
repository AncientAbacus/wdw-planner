// Run: node test.js
const assert = require('assert');
const { findPath } = require('./game.js');

const g = Array.from({ length: 3 }, () => Array(4).fill(null));
g[2][0] = 'gate'; g[2][1] = 'path'; g[2][2] = 'path'; g[1][2] = 'path';
// Ride at (3,1): reachable via the path tile at (2,1).
assert.deepStrictEqual(findPath(g, 0, 2, 3, 1), [[0, 2], [1, 2], [2, 2], [2, 1]]);
// Ride at (0,0): no walkable tile touches it.
assert.strictEqual(findPath(g, 0, 2, 0, 0), null);
// Already adjacent: path is just the start.
assert.deepStrictEqual(findPath(g, 2, 1, 2, 0), [[2, 1]]);
console.log('ok');
