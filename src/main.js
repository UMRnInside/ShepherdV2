const fs = require('fs')
const shepherd = require('./shepherd');
//console.log(process.argv);

if (process.argv.length < 5 || process.argv.length > 7) {
    console.log('Usage : node main.js <config.json> <host> <port> <name> [<password>]');
    process.exit(1);
}
let host = process.argv[3];
let port = parseInt(process.argv[4]);
let name = process.argv[5];
let password = process.argv[6];
let config = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
console.log(host, port, name, password, config);

let bot = shepherd.makeShepherd(host, port, name, password, config);
