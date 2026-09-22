import { NextResponse } from 'next/server';
import { getKodiCommands } from '@/app/lib/kodiRemote';

export const runtime = 'nodejs';

export async function GET(request: Request) {
    const after = Number(new URL(request.url).searchParams.get('after') ?? '0');
    return NextResponse.json({ commands: getKodiCommands(Number.isFinite(after) ? after : 0) }, {
        headers: { 'Cache-Control': 'no-store' },
    });
}
