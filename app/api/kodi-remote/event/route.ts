import { NextResponse } from 'next/server';
import { isKodiEventServerAuthorized, queueKodiCommand } from '@/app/lib/kodiRemote';

export const runtime = 'nodejs';

export async function POST(request: Request) {
    if (!await isKodiEventServerAuthorized(request.headers.get('x-kodi-event-token'))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const command = await request.json() as { type?: unknown; key?: unknown; text?: unknown };
    if (command.type === 'key' && typeof command.key === 'string' && command.key.length <= 64) {
        return NextResponse.json({ command: queueKodiCommand({ type: 'key', key: command.key, code: command.key }) });
    }
    if (command.type === 'text' && typeof command.text === 'string' && command.text.length <= 500) {
        return NextResponse.json({ command: queueKodiCommand({ type: 'text', text: command.text, done: true }) });
    }
    return NextResponse.json({ error: 'Invalid event command' }, { status: 400 });
}
