'use client';

import { useEffect, useState } from 'react';
import { useT } from '@/app/context/I18nContext';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Field, { inputClassName } from '@/components/ui/Field';
import SectionHeader from '@/components/ui/SectionHeader';

interface KodiRemoteStatus {
    configured: boolean;
    username: string;
    authenticationEnabled: boolean;
}

export default function KodiRemoteSection() {
    const t = useT();
    const [status, setStatus] = useState<KodiRemoteStatus | null>(null);
    const [password, setPassword] = useState('');
    const [authenticationEnabled, setAuthenticationEnabled] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        void fetch('/api/kodi-remote/settings')
            .then(response => response.ok ? response.json() : Promise.reject())
            .then((value: KodiRemoteStatus) => { setStatus(value); setAuthenticationEnabled(value.authenticationEnabled); })
            .catch(() => setError(t('settings.kodiRemote.loadError')));
    }, [t]);

    const save = async () => {
        if (authenticationEnabled && password && password.length < 8) {
            setError(t('settings.kodiRemote.passwordRule'));
            return;
        }

        setSaving(true);
        setError('');
        setSaved(false);
        try {
            const response = await fetch('/api/kodi-remote/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: password || undefined, authenticationEnabled }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error);
            setStatus(result);
            setAuthenticationEnabled(result.authenticationEnabled);
            setPassword('');
            setSaved(true);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : t('settings.kodiRemote.saveError'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div>
            <SectionHeader
                title={t('settings.kodiRemote.title')}
                description={t('settings.kodiRemote.description')}
                action={status?.configured ? <Badge tone="ok">{t('settings.kodiRemote.configured')}</Badge> : undefined}
            />

            <p className="text-sm text-ink-2 mb-3">
                {t('settings.kodiRemote.username')}: <span className="font-medium text-ink">{status?.username ?? 'xstream'}</span>
            </p>
            <label className="flex items-center gap-3 text-sm text-ink-2 mb-4">
                <input
                    type="checkbox"
                    checked={authenticationEnabled}
                    onChange={event => { setAuthenticationEnabled(event.target.checked); setSaved(false); }}
                    disabled={saving}
                    data-focusable={saving ? undefined : 'true'}
                />
                {t('settings.kodiRemote.authenticationEnabled')}
            </label>
            <Field label={t('settings.kodiRemote.password')} htmlFor="kodi-remote-password" hint={t('settings.kodiRemote.passwordHint')} error={error || undefined}>
                <input
                    id="kodi-remote-password"
                    type="password"
                    value={password}
                    onChange={event => { setPassword(event.target.value); setSaved(false); }}
                    disabled={saving || !authenticationEnabled}
                    autoComplete="new-password"
                    placeholder={t('settings.kodiRemote.passwordPlaceholder')}
                    data-focusable={saving || !authenticationEnabled ? undefined : 'true'}
                    className={inputClassName}
                />
            </Field>
            <div className="flex items-center gap-3 mt-3">
                <Button onClick={save} loading={saving} disabled={saving}>{t('settings.kodiRemote.save')}</Button>
                {saved && <span className="text-sm text-ok">{t('settings.kodiRemote.saved')}</span>}
            </div>
        </div>
    );
}
