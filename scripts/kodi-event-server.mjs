import dgram from 'node:dgram';
import fs from 'node:fs/promises';
import path from 'node:path';

const port = 9777;
const configPath = path.join(process.cwd(), 'data', 'kodi-remote.json');
const endpoint = 'http://127.0.0.1:3000/api/kodi-remote/event';
const logPath = path.join(process.cwd(), 'data', 'kodi-event-server.log');

const buttonKeys = {
  up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight',
  select: 'Enter', enter: 'Enter', back: 'Escape', previousmenu: 'Escape',
  home: 'Home', menu: 'ContextMenu', contextmenu: 'ContextMenu', info: 'KeyI',
  play: 'MediaPlay', pause: 'MediaPause', stop: 'MediaStop',
  fastforward: 'MediaFastForward', rewind: 'MediaRewind',
  pageup: 'PageUp', pagedown: 'PageDown', skipplus: 'MediaTrackNext', skipminus: 'MediaTrackPrevious',
  volumeup: 'AudioVolumeUp', volumedown: 'AudioVolumeDown', mute: 'AudioVolumeMute',
};

function nulString(buffer, offset) {
  const end = buffer.indexOf(0, offset);
  return buffer.subarray(offset, end < 0 ? buffer.length : end).toString('utf8');
}

function keyFromButton(name, code) {
  const normalized = name.trim().toLowerCase().replace(/[ _-]/g, '');
  if (buttonKeys[normalized]) return buttonKeys[normalized];
  if (name.length === 1) return name;
  // Common Kodi keyboard-keymap names sent by EventClients.
  if (/^f([1-9]|1[0-2])$/i.test(name) || /^(tab|escape|space|insert|delete|home|end|pageup|pagedown)$/i.test(name)) return name;
  if (code >= 32 && code <= 126) return String.fromCharCode(code);
  return null;
}

async function token() {
  const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
  return config.eventServerToken;
}

async function forward(command) {
  const eventToken = await token();
  if (!eventToken) return;
  await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-kodi-event-token': eventToken },
    body: JSON.stringify(command),
  });
}

function packet(data) {
  if (data.length < 32 || data.subarray(0, 4).toString('ascii') !== 'XBMC') return null;
  const type = data.readUInt16BE(6);
  const payloadLength = data.readUInt16BE(16);
  return { type, payload: data.subarray(32, 32 + payloadLength) };
}

const server = dgram.createSocket('udp4');
server.on('message', data => {
  const message = packet(data);
  if (!message) return;
  if (message.type === 0x03 && message.payload.length >= 6) { // BUTTON
    const code = message.payload.readUInt16BE(0);
    const flags = message.payload.readUInt16BE(2);
    if (!(flags & 0x02)) return; // Only key-down events.
    const map = nulString(message.payload, 6);
    const buttonOffset = 6 + Buffer.byteLength(map) + 1;
    const button = nulString(message.payload, buttonOffset);
    const key = keyFromButton(button, code);
    if (key) forward({ type: 'key', key }).catch(() => {});
  }
  if (message.type === 0x0A && message.payload.length > 1) { // ACTION
    const action = nulString(message.payload, 1);
    const key = keyFromButton(action, 0);
    if (key) forward({ type: 'key', key }).catch(() => {});
  }
});
server.on('error', error => fs.appendFile(logPath, `${new Date().toISOString()} ${error.message}\n`).catch(() => {}));
server.bind(port, '0.0.0.0', () => fs.appendFile(logPath, `${new Date().toISOString()} listening on UDP ${port}\n`).catch(() => {}));
