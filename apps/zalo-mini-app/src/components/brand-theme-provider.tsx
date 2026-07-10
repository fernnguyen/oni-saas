import { useEffect } from 'react';
import { useTenantStore } from '@/stores/tenant-store';

function hexToHSL(hex: string): string {
  // Convert hex to HSL string for CSS variables
  let r = 0, g = 0, b = 0;
  if (hex.length === 4) {
    r = parseInt(hex[1] + hex[1], 16);
    g = parseInt(hex[2] + hex[2], 16);
    b = parseInt(hex[3] + hex[3], 16);
  } else if (hex.length === 7) {
    r = parseInt(hex.slice(1, 3), 16);
    g = parseInt(hex.slice(3, 5), 16);
    b = parseInt(hex.slice(5, 7), 16);
  }
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export default function BrandThemeProvider({ children }: { children: React.ReactNode }) {
  const tenant = useTenantStore((s) => s.tenant);

  useEffect(() => {
    if (tenant?.brand_color) {
      const root = document.documentElement;
      root.style.setProperty('--brand-primary', tenant.brand_color);
      // Also update ZMP-UI variables
      root.style.setProperty('--zaui-light-button-primary-background', tenant.brand_color);
      root.style.setProperty('--zaui-light-tabbar-active-line', tenant.brand_color);
      root.style.setProperty('--zaui-light-tabbar-label-active', tenant.brand_color);
    }
  }, [tenant?.brand_color]);

  return <>{children}</>;
}
