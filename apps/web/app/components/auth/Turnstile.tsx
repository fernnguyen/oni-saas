'use client';

import { useEffect, useRef } from 'react';
import Script from 'next/script';

interface TurnstileProps {
  siteKey: string;
  onSuccess: (token: string) => void;
  onError?: () => void;
  onExpire?: () => void;
  theme?: 'light' | 'dark' | 'auto';
  size?: 'normal' | 'flexible' | 'compact';
}

export function Turnstile({
  siteKey,
  onSuccess,
  onError,
  onExpire,
  theme = 'light',
  size = 'normal',
}: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    // If the Turnstile API is already loaded, render the widget
    if (typeof window !== 'undefined' && window.turnstile && containerRef.current) {
      renderWidget();
    }

    return () => {
      // Clean up the widget when component unmounts
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, []);

  const renderWidget = () => {
    if (!containerRef.current || !window.turnstile) return;

    // Avoid double rendering
    if (widgetIdRef.current) return;

    try {
      const widgetId = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        callback: onSuccess,
        'error-callback': onError,
        'expired-callback': onExpire,
        theme,
        size,
      });
      widgetIdRef.current = widgetId;
    } catch (err) {
      console.error('Error rendering Turnstile:', err);
    }
  };

  return (
    <div className="flex justify-center my-2">
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        onLoad={renderWidget}
        strategy="afterInteractive"
      />
      <div ref={containerRef} />
    </div>
  );
}

// Extend global Window interface for typescript
declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          'error-callback'?: () => void;
          'expired-callback'?: () => void;
          theme?: 'light' | 'dark' | 'auto';
          size?: 'normal' | 'flexible' | 'compact';
        }
      ) => string;
      remove: (widgetId: string) => void;
      reset: (widgetId: string) => void;
    };
  }
}
