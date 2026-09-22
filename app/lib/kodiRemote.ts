import 'server-only';

import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

const CONFIG_PATH = path.join(process.cwd(), 'data', 'kodi-remote.json');
const MAX_COMMANDS = 500;

export type KodiRemoteCommand =
    | { id: number; type: 'key'; key: string; code?: string; ctrlKey?: boolean }
    | { id: number; type: 'text'; text: string; done: boolean }
    | { id: number; type: 'volume'; value: number };

type KodiRemoteCommandInput =
    | { type: 'key'; key: string; code?: string; ctrlKey?: boolean }
    | { type: 'text'; text: string; done: boolean }
    | { type: 'volume'; value: number };

interface KodiRemoteConfig {
    username: string;
    passwordHash: string;
    authenticationEnabled?: boolean;
    eventServerToken?: string;
}

interface KodiRemoteState {
    nextId: number;
    commands: KodiRemoteCommand[];
}

const stateKey = '__xstreamKodiRemoteState';

function getState(): KodiRemoteState {
    const root = globalThis as typeof globalThis & { [stateKey]?: KodiRemoteState };
    if (!root[stateKey]) {
        root[stateKey] = { nextId: 1, commands: [] };
    }
    return root[stateKey];
}

async function getConfig(): Promise<KodiRemoteConfig | null> {
    try {
        return JSON.parse(await fs.readFile(CONFIG_PATH, 'utf8')) as KodiRemoteConfig;
    } catch (error: unknown) {
        if (typeof error === 'object' && error && 'code' in error && error.code === 'ENOENT') return null;
        throw error;
    }
}

function hashPassword(password: string) {
    const salt = crypto.randomBytes(16).toString('base64url');
    return `${salt}:${crypto.scryptSync(password, salt, 32).toString('base64url')}`;
}

export async function getKodiRemoteStatus() {
    const config = await getConfig();
    return {
        configured: Boolean(config),
        username: config?.username ?? 'xstream',
        authenticationEnabled: config?.authenticationEnabled !== false,
    };
}

export async function updateKodiRemoteSettings({ password, authenticationEnabled }: { password?: string; authenticationEnabled?: boolean }) {
    if (password !== undefined && password.length < 8) {
        throw new Error('Use at least 8 characters for the Kodi remote password.');
    }

    const config = await getConfig();
    if (!config && password === undefined) {
        throw new Error('Set a password before enabling the Kodi remote.');
    }

    await fs.mkdir(path.dirname(CONFIG_PATH), { recursive: true });
    await fs.writeFile(CONFIG_PATH, `${JSON.stringify({
        username: config?.username ?? 'xstream',
        passwordHash: password === undefined ? config!.passwordHash : hashPassword(password),
        authenticationEnabled: authenticationEnabled ?? config?.authenticationEnabled ?? true,
        eventServerToken: config?.eventServerToken ?? crypto.randomBytes(32).toString('base64url'),
    }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    return getKodiRemoteStatus();
}

export async function isKodiEventServerAuthorized(token: string | null): Promise<boolean> {
    const config = await getConfig();
    if (!config?.eventServerToken || !token) return false;
    const actual = Buffer.from(token);
    const expected = Buffer.from(config.eventServerToken);
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export async function isKodiRemoteAuthorized(authorization: string | null): Promise<boolean> {
    const config = await getConfig();
    if (config?.authenticationEnabled === false) return true;
    if (!config || !authorization?.startsWith('Basic ')) return false;

    let credentials: string;
    try {
        credentials = Buffer.from(authorization.slice(6), 'base64').toString('utf8');
    } catch {
        return false;
    }

    const separator = credentials.indexOf(':');
    if (separator < 1) return false;

    const username = credentials.slice(0, separator);
    const password = credentials.slice(separator + 1);
    const [salt, expected] = config.passwordHash.split(':');
    if (!salt || !expected || username !== config.username) return false;

    const actual = crypto.scryptSync(password, salt, 32).toString('base64url');
    const actualBuffer = Buffer.from(actual);
    const expectedBuffer = Buffer.from(expected);
    return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

export function queueKodiCommand(command: KodiRemoteCommandInput) {
    const state = getState();
    const queued = { ...command, id: state.nextId++ } as KodiRemoteCommand;
    state.commands.push(queued);
    if (state.commands.length > MAX_COMMANDS) state.commands.splice(0, state.commands.length - MAX_COMMANDS);
    return queued;
}

export function getKodiCommands(after: number) {
    return getState().commands.filter(command => command.id > after);
}

const INPUT_KEYS: Record<string, string> = {
    'input.up': 'ArrowUp',
    'input.down': 'ArrowDown',
    'input.left': 'ArrowLeft',
    'input.right': 'ArrowRight',
    'input.select': 'Enter',
    'input.back': 'Escape',
    'input.home': 'Home',
    'input.contextmenu': 'ContextMenu',
};

const ACTION_KEYS: Record<string, string> = {
    up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight',
    select: 'Enter', back: 'Escape', pause: 'MediaPause', play: 'MediaPlay',
    stop: 'MediaStop', fastforward: 'MediaFastForward', rewind: 'MediaRewind',
};

function keyCommand(key: string) {
    return queueKodiCommand({ type: 'key', key, code: key });
}

export function handleKodiMethod(method: string, params: unknown) {
    const normalized = method.toLowerCase();

    if (INPUT_KEYS[normalized]) return keyCommand(INPUT_KEYS[normalized]);

    if (normalized === 'input.sendtext' && typeof params === 'object' && params !== null) {
        const value = params as { text?: unknown; done?: unknown };
        if (typeof value.text !== 'string') throw new Error('Input.SendText requires text');
        return queueKodiCommand({ type: 'text', text: value.text, done: value.done !== false });
    }

    if (normalized === 'input.executeaction' && typeof params === 'object' && params !== null) {
        const action = (params as { action?: unknown }).action;
        if (typeof action === 'string' && ACTION_KEYS[action.toLowerCase()]) {
            return keyCommand(ACTION_KEYS[action.toLowerCase()]);
        }
    }

    if (normalized === 'input.buttonevent' && typeof params === 'object' && params !== null) {
        const button = (params as { button?: unknown }).button;
        if (typeof button === 'string') {
            const mapped = ACTION_KEYS[button.toLowerCase()] ?? button;
            return keyCommand(mapped);
        }
    }

    if (normalized === 'player.playpause') return keyCommand('MediaPlayPause');
    if (normalized === 'player.stop') return keyCommand('MediaStop');
    if (normalized === 'player.seek' && typeof params === 'object' && params !== null) {
        const value = (params as { value?: unknown }).value;
        if (value === 'smallforward' || value === 'bigforward') return keyCommand('MediaFastForward');
        if (value === 'smallbackward' || value === 'bigbackward') return keyCommand('MediaRewind');
    }
    if (normalized === 'application.setvolume' && typeof params === 'object' && params !== null) {
        const volume = (params as { volume?: unknown }).volume;
        if (typeof volume === 'number' && Number.isFinite(volume)) {
            return queueKodiCommand({ type: 'volume', value: Math.max(0, Math.min(100, volume)) });
        }
    }

    // Methods queried by Kodi remotes during their connection test. They need a
    // valid response even though Xstream is not a media-library implementation.
    if (['jsonrpc.ping', 'jsonrpc.version', 'jsonrpc.introspect', 'jsonrpc.permission', 'application.getproperties', 'player.getactiveplayers', 'gui.getproperties'].includes(normalized)) {
        return null;
    }

    throw new Error(`Unsupported Kodi method: ${method}`);
}
