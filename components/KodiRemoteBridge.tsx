'use client';

import { useEffect, useRef } from 'react';

type Command =
    | { id: number; type: 'key'; key: string; code?: string; ctrlKey?: boolean }
    | { id: number; type: 'text'; text: string; done: boolean }
    | { id: number; type: 'volume'; value: number };

function injectText(text: string, done: boolean) {
    const active = document.activeElement;
    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
        const setter = active instanceof HTMLInputElement
            ? Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
            : Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
        setter?.call(active, `${active.value}${text}`);
        active.dispatchEvent(new Event('input', { bubbles: true }));
        if (done) active.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
        return;
    }

    for (const character of text) {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: character, code: `Key${character.toUpperCase()}`, bubbles: true, cancelable: true }));
    }
}

export default function KodiRemoteBridge() {
    const lastId = useRef(0);

    useEffect(() => {
        let stopped = false;

        const poll = async () => {
            try {
                const response = await fetch(`/api/kodi-remote/commands?after=${lastId.current}`, { cache: 'no-store' });
                if (!response.ok) return;
                const { commands } = await response.json() as { commands: Command[] };
                for (const command of commands) {
                    lastId.current = Math.max(lastId.current, command.id);
                    if (command.type === 'key') {
                        const keyboardEvent = new KeyboardEvent('keydown', {
                            key: command.key,
                            code: command.code ?? command.key,
                            ctrlKey: command.ctrlKey,
                            bubbles: true,
                            cancelable: true,
                        });
                        const notHandled = window.dispatchEvent(keyboardEvent);
                        // The player handles Enter itself. Elsewhere in the app,
                        // TV navigation focuses buttons but deliberately leaves
                        // Enter untouched, so activate the focused control here.
                        if (command.key === 'Enter' && notHandled) {
                            const active = document.activeElement;
                            const control = active instanceof HTMLElement
                                ? active.closest<HTMLElement>('button, a, [role="button"], [data-focusable="true"]')
                                : null;
                            control?.click();
                        }
                    } else if (command.type === 'text') {
                        injectText(command.text, command.done);
                    } else {
                        window.dispatchEvent(new CustomEvent('xstream-kodi-volume', { detail: command.value }));
                    }
                }
            } catch {
                // A temporary network failure must not take down the player.
            }
        };

        void poll();
        const timer = window.setInterval(() => { if (!stopped) void poll(); }, 350);
        return () => { stopped = true; window.clearInterval(timer); };
    }, []);

    return null;
}
