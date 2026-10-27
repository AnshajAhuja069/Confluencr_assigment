// Copies non-TypeScript assets (SQL migrations) into dist/ after `tsc`.
const fs = require('node:fs');
const path = require('node:path');

const from = path.join(__dirname, '..', 'src', 'migrations');
const to = path.join(__dirname, '..', 'dist', 'migrations');
fs.cpSync(from, to, { recursive: true });
console.log(`copied ${from} -> ${to}`);
