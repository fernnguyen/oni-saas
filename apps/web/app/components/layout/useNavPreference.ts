'use client';

import { useState, useEffect, useCallback } from 'react';

export type NavMode = 'vertical' | 'horizontal';

export interface NavGroupPref {
  /** Group label as identifier */
  label: string;
  /** Display order (1-based). Lower = shown first */
  order: number;
  /** If false, group goes into "Thêm" overflow dropdown */
  visible: boolean;
}

export interface NavPreference {
  mode: NavMode;
  groups: NavGroupPref[];
}

const STORAGE_KEY = 'oni-nav-pref';

function loadPreference(): NavPreference | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as NavPreference;
  } catch {
    return null;
  }
}

function savePreference(pref: NavPreference) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pref));
  } catch {
    // ignore storage errors
  }
}

/**
 * Builds default group preferences from nav group labels.
 * All groups visible by default, order follows array index.
 */
export function buildDefaultGroupPrefs(groupLabels: string[]): NavGroupPref[] {
  return groupLabels.map((label, i) => ({
    label,
    order: i + 1,
    visible: true,
  }));
}

/**
 * Merges saved preferences with the current set of group labels.
 * - New groups (not in saved prefs) are appended at the end, visible by default.
 * - Groups that no longer exist are dropped.
 */
function mergeGroupPrefs(
  saved: NavGroupPref[],
  currentLabels: string[],
): NavGroupPref[] {
  const maxOrder = saved.length > 0 ? Math.max(...saved.map((g) => g.order)) : 0;
  const merged: NavGroupPref[] = currentLabels.map((label) => {
    const existing = saved.find((g) => g.label === label);
    if (existing) return existing;
    return { label, order: maxOrder + currentLabels.indexOf(label) + 1, visible: true };
  });
  return merged;
}

/**
 * Applies group preferences to sort and categorize nav groups.
 * Returns { main: visible groups sorted by order, overflow: hidden groups }
 */
export function applyGroupPrefs<T extends { label?: string }>(
  groups: T[],
  prefs: NavGroupPref[],
): { main: T[]; overflow: T[] } {
  const main: T[] = [];
  const overflow: T[] = [];

  const sorted = [...groups].sort((a, b) => {
    const pa = prefs.find((p) => p.label === a.label);
    const pb = prefs.find((p) => p.label === b.label);
    return (pa?.order ?? 999) - (pb?.order ?? 999);
  });

  for (const group of sorted) {
    const pref = prefs.find((p) => p.label === group.label);
    // Groups without label (e.g. "Tổng quan") are always in main
    if (!group.label || (pref?.visible !== false)) {
      main.push(group);
    } else {
      overflow.push(group);
    }
  }

  return { main, overflow };
}

export interface UseNavPreferenceReturn {
  mode: NavMode;
  groupPrefs: NavGroupPref[];
  setMode: (mode: NavMode) => void;
  setGroupPrefs: (prefs: NavGroupPref[]) => void;
  resetGroupPrefs: (groupLabels: string[]) => void;
  mounted: boolean;
}

/**
 * Hook to manage nav layout preferences persisted to localStorage.
 * @param groupLabels - current nav group labels in default order
 */
export function useNavPreference(groupLabels: string[]): UseNavPreferenceReturn {
  const [mounted, setMounted] = useState(false);
  const [pref, setPref] = useState<NavPreference>({
    mode: 'horizontal',
    groups: buildDefaultGroupPrefs(groupLabels),
  });

  // Hydrate from localStorage on mount
  useEffect(() => {
    const saved = loadPreference();
    if (saved) {
      setPref({
        mode: saved.mode ?? 'horizontal',
        groups: mergeGroupPrefs(saved.groups ?? [], groupLabels),
      });
    }
    setMounted(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setMode = useCallback((mode: NavMode) => {
    setPref((prev) => {
      const next = { ...prev, mode };
      savePreference(next);
      return next;
    });
  }, []);

  const setGroupPrefs = useCallback((groups: NavGroupPref[]) => {
    setPref((prev) => {
      const next = { ...prev, groups };
      savePreference(next);
      return next;
    });
  }, []);

  const resetGroupPrefs = useCallback((labels: string[]) => {
    setPref((prev) => {
      const next = { ...prev, groups: buildDefaultGroupPrefs(labels) };
      savePreference(next);
      return next;
    });
  }, []);

  return {
    mode: pref.mode,
    groupPrefs: pref.groups,
    setMode,
    setGroupPrefs,
    resetGroupPrefs,
    mounted,
  };
}
