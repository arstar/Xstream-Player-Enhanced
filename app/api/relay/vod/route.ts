import { NextResponse } from 'next/server';
import { enforceApiAccess } from '@/app/lib/apiAuth';
import { killBroadcast, restartVodBroadcast, type VodType } from '@/app/lib/vodBroadcast';
import { stopDevice } from '@/app/lib/tvModeStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VOD_TYPES = ['movie', 'series'];
/** Longest title we accept a seek into (~28h) — guards against absurd offsets. */
const MAX_START_SECONDS = 100000;

interface SeekRequestBody {
    action?: 'seek';
    contentType?: string;
    streamId?: string;
    ext?: string;
    start?: number;
}

/**
 * Moves a running broadcast to another point of the title. The caller then reloads the
 * playlist with the same offset; ordering matters, so this must finish before the
 * player asks for the new playlist.
 */
export async function POST(request: Request) {
    const accessResponse = await enforceApiAccess(request);
    if (accessResponse) return accessResponse;

    try {
        const body = (await request.json()) as SeekRequestBody;

        if (body.action !== 'seek') {
            return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        }

        const contentType = body.contentType ?? '';
        const streamId = body.streamId ?? '';
        const ext = body.ext ?? 'mp4';
        const start = Math.floor(body.start ?? 0);

        if (!VOD_TYPES.includes(contentType) || !/^\d+$/.test(streamId) || !/^[a-z0-9]{1,5}$/i.test(ext)) {
            return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
        }
        if (!Number.isFinite(start) || start < 0 || start > MAX_START_SECONDS) {
            return NextResponse.json({ error: 'Invalid position' }, { status: 400 });
        }

        const result = await restartVodBroadcast(contentType as VodType, streamId, ext, start);
        if ('error' in result) {
            return NextResponse.json({ error: result.error }, { status: 503 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[VodBroadcast] Failed to seek broadcast', error);
        return NextResponse.json({ error: 'Failed to seek broadcast' }, { status: 500 });
    }
}

/**
 * Forced stop of a broadcast, from the TV Mode screen. Kills the ffmpeg process (VOD)
 * and marks the broadcasting device, so its heartbeat stops re-registering the session.
 * Any device on the network may do it: the network is private, the app has no auth, and
 * limiting it to the broadcaster would rule out the very case this exists for — the
 * device left paused and forgotten.
 */
export async function DELETE(request: Request) {
    const accessResponse = await enforceApiAccess(request);
    if (accessResponse) return accessResponse;

    try {
        const { searchParams } = new URL(request.url);
        const deviceId = searchParams.get('deviceId');
        const contentType = searchParams.get('contentType') ?? '';
        const streamId = searchParams.get('streamId') ?? '';

        if (!deviceId) {
            return NextResponse.json({ error: 'Missing deviceId' }, { status: 400 });
        }

        // Live channels have no ffmpeg behind them (the live relay is just a cache).
        if (VOD_TYPES.includes(contentType) && /^\d+$/.test(streamId)) {
            killBroadcast(`${contentType}_${streamId}`);
        }

        stopDevice(deviceId);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[VodBroadcast] Failed to stop broadcast', error);
        return NextResponse.json({ error: 'Failed to stop broadcast' }, { status: 500 });
    }
}
