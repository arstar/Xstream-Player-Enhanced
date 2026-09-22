import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const configPath = path.join(process.cwd(), 'data', 'kodi-remote.json');
const username = 'xstream';
const suppliedPassword = process.argv[2];

if (suppliedPassword && suppliedPassword.length < 8) {
    throw new Error('Choose a Kodi remote password of at least 8 characters.');
}

const password = suppliedPassword || crypto.randomBytes(18).toString('base64url');
const salt = crypto.randomBytes(16).toString('base64url');
const passwordHash = crypto.scryptSync(password, salt, 32).toString('base64url');

await fs.mkdir(path.dirname(configPath), { recursive: true });
await fs.writeFile(configPath, `${JSON.stringify({ username, passwordHash: `${salt}:${passwordHash}`, authenticationEnabled: true }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });

console.log(`Kodi remote ${suppliedPassword ? 'password updated' : 'configured'}. Username: ${username}`);
console.log(`Password: ${password}`);
