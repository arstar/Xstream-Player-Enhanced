import { NextResponse } from 'next/server';
import { enforceApiAccess } from '@/app/lib/apiAuth';
import { getKodiRemoteStatus, updateKodiRemoteSettings } from '@/app/lib/kodiRemote';

export const runtime = 'nodejs';

export async function GET(request: Request) {
    const denied = await enforceApiAccess(request);
    if (denied) return denied;
    return NextResponse.json(await getKodiRemoteStatus());
}

export async function POST(request: Request) {
    const denied = await enforceApiAccess(request);
    if (denied) return denied;

    const body = await request.json().catch(() => ({}));
    if (body.password !== undefined && typeof body.password !== 'string') {
        return NextResponse.json({ error: 'Invalid password.' }, { status: 400 });
    }
    if (body.authenticationEnabled !== undefined && typeof body.authenticationEnabled !== 'boolean') {
        return NextResponse.json({ error: 'Invalid authentication setting.' }, { status: 400 });
    }

    try {
        return NextResponse.json(await updateKodiRemoteSettings({
            password: body.password,
            authenticationEnabled: body.authenticationEnabled,
        }));
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Could not update the Kodi remote password.' },
            { status: 400 }
        );
    }
}
