import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const target = path.join(root, 'toe/app');
await rm(target, { recursive: true, force: true });
await mkdir(path.join(target, 'dist'), { recursive: true });
await cp(path.join(root, 'dist/client'), path.join(target, 'dist/client'), { recursive: true });
await cp(path.join(root, 'server.mjs'), path.join(target, 'server.mjs'));
await cp(path.join(root, 'ha-users.mjs'), path.join(target, 'ha-users.mjs'));
await cp(path.join(root, 'notifications.mjs'), path.join(target, 'notifications.mjs'));
await mkdir(path.join(target, 'src'), {recursive:true});
await cp(path.join(root, 'src/api.js'), path.join(target, 'src/api.js'));
// Node must treat src/api.js as an ES module inside the standalone image.
await cp(path.join(root, 'package.json'), path.join(target, 'package.json'));
console.log('Prepared toe/app. Commit this generated directory with toe/config.yaml for installation by Supervisor.');
