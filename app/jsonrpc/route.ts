import { NextResponse } from 'next/server';
import { handleKodiMethod, isKodiRemoteAuthorized } from '@/app/lib/kodiRemote';

export const runtime = 'nodejs';

type RpcRequest = { jsonrpc?: unknown; method?: unknown; params?: unknown; id?: unknown };

const introspection = {
    version: { major: 13, minor: 0, patch: 0 },
    methods: {
        'JSONRPC.Version': { type: 'method', returns: { type: 'object' } },
        'JSONRPC.Ping': { type: 'method', returns: { type: 'string' } },
        'Input.Up': { type: 'method', returns: { type: 'string' } },
        'Input.Down': { type: 'method', returns: { type: 'string' } },
        'Input.Left': { type: 'method', returns: { type: 'string' } },
        'Input.Right': { type: 'method', returns: { type: 'string' } },
        'Input.Select': { type: 'method', returns: { type: 'string' } },
        'Input.Back': { type: 'method', returns: { type: 'string' } },
        'Input.SendText': { type: 'method', returns: { type: 'string' } },
        'Player.PlayPause': { type: 'method', returns: { type: 'string' } },
        'Player.Stop': { type: 'method', returns: { type: 'string' } },
    },
};

function response(id: unknown, result?: unknown, error?: { code: number; message: string }) {
    return { jsonrpc: '2.0', id: id ?? null, ...(error ? { error } : { result: result ?? 'OK' }) };
}

async function processRequest(request: RpcRequest) {
    if (request.jsonrpc !== '2.0' || typeof request.method !== 'string') {
        return response(request.id, undefined, { code: -32600, message: 'Invalid Request' });
    }

    try {
        const queued = handleKodiMethod(request.method, request.params);
        if (request.method.toLowerCase() === 'jsonrpc.version') {
            return response(request.id, { version: { major: 13, minor: 0, patch: 0 } });
        }
        if (request.method.toLowerCase() === 'jsonrpc.introspect') return response(request.id, introspection);
        if (request.method.toLowerCase() === 'jsonrpc.permission') {
            return response(request.id, {
                controlgui: true, controlnotify: true, controlplayback: true,
                controlpower: false, controlpvr: false, controlsystem: false,
                executeaddon: false, manageaddon: false, navigate: true,
                readdata: true, removedata: false, updatedata: false, writefile: false,
            });
        }
        if (request.method.toLowerCase() === 'player.getactiveplayers') return response(request.id, []);
        if (request.method.toLowerCase() === 'application.getproperties') {
            return response(request.id, {
                volume: 100,
                muted: false,
                name: 'Kodi',
                version: { major: 21, minor: 0, revision: 'Xstream', tag: 'stable' },
            });
        }
        if (request.method.toLowerCase() === 'gui.getproperties') return response(request.id, { currentwindow: { id: 10000, label: 'Xstream Player' } });
        return response(request.id, queued ? 'OK' : 'OK');
    } catch (error) {
        return response(request.id, undefined, { code: -32601, message: error instanceof Error ? error.message : 'Method not found' });
    }
}

export async function POST(request: Request) {
    if (!(await isKodiRemoteAuthorized(request.headers.get('authorization')))) {
        return new NextResponse('Kodi remote authentication required', {
            status: 401,
            headers: { 'WWW-Authenticate': 'Basic realm="Xstream Kodi Remote"' },
        });
    }

    let body: RpcRequest | RpcRequest[];
    try {
        body = await request.json();
    } catch {
        return NextResponse.json(response(null, undefined, { code: -32700, message: 'Parse error' }), { status: 400 });
    }

    const result = Array.isArray(body)
        ? await Promise.all(body.map(processRequest))
        : await processRequest(body);
    return NextResponse.json(result);
}

export async function GET(request: Request) {
    if (!(await isKodiRemoteAuthorized(request.headers.get('authorization')))) {
        return new NextResponse('Kodi remote authentication required', { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="Xstream Kodi Remote"' } });
    }

    const encodedRequest = new URL(request.url).searchParams.get('request');
    if (!encodedRequest) {
        return NextResponse.json(response(null, introspection));
    }

    try {
        const body = JSON.parse(encodedRequest) as RpcRequest | RpcRequest[];
        const result = Array.isArray(body)
            ? await Promise.all(body.map(processRequest))
            : await processRequest(body);
        return NextResponse.json(result);
    } catch {
        return NextResponse.json(response(null, undefined, { code: -32700, message: 'Parse error' }), { status: 400 });
    }
}
