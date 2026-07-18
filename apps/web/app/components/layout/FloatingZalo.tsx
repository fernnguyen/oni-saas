'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

const ZALO_SDK_SRC = 'https://sp.zalo.me/plugins/sdk.js';
const ZALO_OA_URL = 'https://zalo.me/2780444502954767948';

declare global {
  interface Window {
    ZaloSocialSDK?: {
      reload?: () => void;
    };
  }
}

function ensureZaloSdk() {
  if (typeof window === 'undefined') return Promise.reject(new Error('Window unavailable'));

  const existing = document.querySelector<HTMLScriptElement>(`script[src="${ZALO_SDK_SRC}"]`);
  if (existing?.dataset.loaded === 'true') return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Zalo SDK failed to load')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = ZALO_SDK_SRC;
    script.async = true;
    script.onload = () => {
      script.dataset.loaded = 'true';
      resolve();
    };
    script.onerror = () => reject(new Error('Zalo SDK failed to load'));
    document.body.appendChild(script);
  });
}

export function FloatingZalo() {
  const widgetHostRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

  useEffect(() => {
    if (status !== 'ready' || !widgetHostRef.current) return;

    widgetHostRef.current.innerHTML = '';
    const widget = document.createElement('div');
    widget.className = 'zalo-chat-widget';
    widget.dataset.oaid = '2780444502954767948';
    widget.dataset.welcomeMessage = 'Rất vui khi được hỗ trợ bạn!';
    widget.dataset.autopopup = '0';
    widget.dataset.width = '';
    widget.dataset.height = '';
    widgetHostRef.current.appendChild(widget);

    window.ZaloSocialSDK?.reload?.();
  }, [status]);

  const handleOpenChat = async () => {
    if (status === 'loading') return;

    if (status === 'ready') {
      window.ZaloSocialSDK?.reload?.();
      return;
    }

    setStatus('loading');
    try {
      await ensureZaloSdk();
      setStatus('ready');
    } catch {
      setStatus('error');
      window.open(ZALO_OA_URL, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {status === 'ready' ? (
        <div ref={widgetHostRef} />
      ) : (
        <button
          type="button"
          onClick={handleOpenChat}
          className="flex h-14 items-center gap-3 rounded-full bg-[#0068ff] px-4 text-sm font-bold text-white shadow-xl shadow-blue-900/20 transition-transform hover:scale-105 disabled:cursor-wait disabled:opacity-80"
          disabled={status === 'loading'}
          aria-label="Mở chat Zalo"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15">
            <Image
              src="/partners/zalo.svg"
              alt=""
              width={24}
              height={24}
              className="h-6 w-6"
              aria-hidden="true"
            />
          </span>
          <span>{status === 'loading' ? 'Đang mở chat...' : 'Chat qua Zalo'}</span>
        </button>
      )}
      {status === 'error' ? (
        <a
          href={ZALO_OA_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 block text-center text-xs font-semibold text-slate-600 underline underline-offset-2"
        >
          Mở Zalo trực tiếp
        </a>
      ) : null}
    </div>
  );
}
