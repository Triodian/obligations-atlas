// Copy the shared core into public/ so the browser can import it as /core/atlas.js.
import fs from 'node:fs';
fs.mkdirSync('public/core', { recursive: true });
fs.copyFileSync('src/core/atlas.js', 'public/core/atlas.js');
console.log('public/core/atlas.js updated');
