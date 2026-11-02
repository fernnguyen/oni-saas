import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, BackHandler, Easing, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';

/**
 * PosDialog — one reusable confirm/alert dialog for the POS table, ordering and checkout flows
 * (replaces native Alert.alert there).
 *
 * Usage:
 *   const dialog = usePosDialog();
 *   const choice = await dialog.confirm({ title, message, tone: 'warning', actions: [...] });
 *
 * Rendering over other RN Modals (iOS): iOS presents one modal view controller at a time from the
 * root, so a dialog rendered as its own <Modal> at the screen root cannot appear above an already
 * presented <Modal> (sheet, checkout…). Instead the dialog is NOT a Modal: it is an absolute-fill
 * overlay drawn by a <PosDialogHost />. A host is placed at the screen root AND as the last child
 * inside every Modal that may ask a question. Hosts register on mount (a Modal's children only
 * mount while it is shown); the most recently registered (= top-most presented) host draws the
 * dialog, so it always lands inside the Modal the user is looking at.
 */

type FeatherName = React.ComponentProps<typeof Feather>['name'];

export type PosDialogTone = 'info' | 'warning' | 'danger' | 'success';
export type PosDialogActionStyle = 'primary' | 'secondary' | 'destructive';

export interface PosDialogAction<K extends string = string> {
  key: K;
  label: string;
  style?: PosDialogActionStyle;
  /**
   * Optional async work run when the button is pressed: the button shows a spinner (other buttons
   * disabled, dialog not dismissable) until it settles, then the dialog closes. Throwing keeps the
   * dialog open so the user can retry or pick another action.
   */
  onPress?: () => void | Promise<void>;
  /** Text shown next to the spinner while onPress runs (default: label) */
  loadingLabel?: string;
}

export interface PosDialogOptions<K extends string = string> {
  title: string;
  message?: string;
  tone?: PosDialogTone;
  /** Override the tone's Feather icon */
  icon?: FeatherName;
  /** 1–3 buttons. Default: a single "Đã hiểu" button. */
  actions?: PosDialogAction<K>[];
  /** Backdrop tap / Android back closes the dialog (resolves `cancelKey`). Default true. */
  dismissable?: boolean;
  /** Key resolved when dismissed. Default: the first 'secondary' action's key, else null. */
  cancelKey?: K;
}

export interface PosDialogApi {
  /** Shows the dialog and resolves with the chosen action key (null when dismissed without a cancelKey). */
  confirm<K extends string>(opts: PosDialogOptions<K>): Promise<K | null>;
  /** Single-button informational dialog. */
  alert(title: string, message?: string, tone?: PosDialogTone): Promise<void>;
}

type PendingDialog = {
  id: number;
  opts: PosDialogOptions<string>;
  resolve: (key: string | null) => void;
};

interface PosDialogContextValue {
  api: PosDialogApi;
  current: PendingDialog | null;
  topHostId: number | null;
  registerHost: (id: number) => void;
  unregisterHost: (id: number) => void;
  settle: (id: number, key: string | null) => void;
  /** For a Modal's onRequestClose (Android back): returns true when a dialog consumed the event. */
  handleBack: () => boolean;
}

const PosDialogContext = createContext<PosDialogContextValue | null>(null);

const DEFAULT_ACTIONS: PosDialogAction<string>[] = [{ key: 'ok', label: 'Đã hiểu', style: 'primary' }];

const actionsOf = (opts: PosDialogOptions<string>) =>
  (opts.actions && opts.actions.length > 0 ? opts.actions : DEFAULT_ACTIONS).slice(0, 3);

const cancelKeyOf = (opts: PosDialogOptions<string>): string | null => {
  if (opts.cancelKey !== undefined) return opts.cancelKey;
  const secondary = actionsOf(opts).find(a => a.style === 'secondary');
  return secondary ? secondary.key : null;
};

/** Native Alert fallback, used only when a component renders outside a PosDialogProvider. */
const fallbackApi: PosDialogApi = {
  confirm: <K extends string>(opts: PosDialogOptions<K>) =>
    new Promise<K | null>((resolve) => {
      const actions = actionsOf(opts as PosDialogOptions<string>) as PosDialogAction<K>[];
      Alert.alert(
        opts.title,
        opts.message,
        actions.map(a => ({
          text: a.label,
          style: a.style === 'destructive' ? 'destructive' : a.style === 'secondary' ? 'cancel' : 'default',
          onPress: async () => {
            try { await a.onPress?.(); } catch { /* best effort */ }
            resolve(a.key);
          },
        })),
        { cancelable: opts.dismissable !== false, onDismiss: () => resolve((cancelKeyOf(opts as PosDialogOptions<string>) as K | null)) }
      );
    }),
  alert: (title, message) =>
    new Promise<void>((resolve) => {
      Alert.alert(title, message, [{ text: 'Đã hiểu', onPress: () => resolve() }], { onDismiss: () => resolve() });
    }),
};

/** Owns the dialog queue + host registry. Call once in the screen and pass the value to <PosDialogProvider>. */
export function usePosDialogController(): PosDialogContextValue {
  const queueRef = useRef<PendingDialog[]>([]);
  const [current, setCurrent] = useState<PendingDialog | null>(null);
  const [hosts, setHosts] = useState<number[]>([]);
  const idRef = useRef(0);

  const syncCurrent = useCallback(() => {
    setCurrent(queueRef.current[0] || null);
  }, []);

  const confirm = useCallback(<K extends string>(opts: PosDialogOptions<K>) =>
    new Promise<K | null>((resolve) => {
      const id = ++idRef.current;
      queueRef.current = [...queueRef.current, { id, opts: opts as PosDialogOptions<string>, resolve: resolve as (k: string | null) => void }];
      syncCurrent();
    }), [syncCurrent]);

  const alert = useCallback(async (title: string, message?: string, tone: PosDialogTone = 'info') => {
    await confirm({ title, message, tone, actions: [{ key: 'ok', label: 'Đã hiểu', style: 'primary' }] });
  }, [confirm]);

  const settle = useCallback((id: number, key: string | null) => {
    const item = queueRef.current.find(p => p.id === id);
    if (!item) return;
    queueRef.current = queueRef.current.filter(p => p.id !== id);
    syncCurrent();
    item.resolve(key);
  }, [syncCurrent]);

  const handleBack = useCallback(() => {
    const head = queueRef.current[0];
    if (!head) return false;
    if (head.opts.dismissable !== false && !busyDialogIds.has(head.id)) settle(head.id, cancelKeyOf(head.opts));
    return true;
  }, [settle]);

  const registerHost = useCallback((id: number) => {
    setHosts(prev => (prev.includes(id) ? prev : [...prev, id]));
  }, []);
  const unregisterHost = useCallback((id: number) => {
    setHosts(prev => prev.filter(h => h !== id));
  }, []);

  const api = useMemo<PosDialogApi>(() => ({ confirm, alert }), [confirm, alert]);

  return useMemo(() => ({
    api,
    current,
    topHostId: hosts.length > 0 ? hosts[hosts.length - 1] : null,
    registerHost,
    unregisterHost,
    settle,
    handleBack,
  }), [api, current, hosts, registerHost, unregisterHost, settle, handleBack]);
}

export function PosDialogProvider({ value, children }: { value: PosDialogContextValue; children: React.ReactNode }) {
  return <PosDialogContext.Provider value={value}>{children}</PosDialogContext.Provider>;
}

/** Imperative dialog API (falls back to native Alert outside a provider). */
export function usePosDialog(): PosDialogApi & { handleBack: () => boolean } {
  const ctx = useContext(PosDialogContext);
  return useMemo(() => ({
    confirm: ctx ? ctx.api.confirm : fallbackApi.confirm,
    alert: ctx ? ctx.api.alert : fallbackApi.alert,
    handleBack: ctx ? ctx.handleBack : () => false,
  }), [ctx?.api, ctx?.handleBack]);
}

// Dialog ids whose action is running (not dismissable meanwhile)
const busyDialogIds = new Set<number>();
let hostSeq = 0;

/**
 * Place one at the screen root and one as the LAST child of each RN Modal whose flow can show a
 * dialog. `active` should follow the Modal's visibility so a closing Modal stops drawing dialogs.
 */
export function PosDialogHost({ active = true }: { active?: boolean }) {
  const ctx = useContext(PosDialogContext);
  const [id] = useState(() => ++hostSeq);
  const registerHost = ctx?.registerHost;
  const unregisterHost = ctx?.unregisterHost;

  useLayoutEffect(() => {
    if (!registerHost || !unregisterHost || !active) return;
    registerHost(id);
    return () => unregisterHost(id);
  }, [registerHost, unregisterHost, active, id]);

  if (!ctx || !active || ctx.topHostId !== id || !ctx.current) return null;
  return <PosDialogView key={ctx.current.id} pending={ctx.current} onSettle={ctx.settle} />;
}

const TONES: Record<PosDialogTone, { icon: FeatherName; color: string; bg: string; border: string }> = {
  info: { icon: 'info', color: '#fa5908', bg: '#fff7ed', border: '#ffedd5' },
  warning: { icon: 'alert-triangle', color: '#d97706', bg: '#fffbeb', border: '#fef3c7' },
  danger: { icon: 'alert-octagon', color: '#e11d48', bg: '#fff1f2', border: '#ffe4e6' },
  success: { icon: 'check-circle', color: '#059669', bg: '#ecfdf5', border: '#d1fae5' },
};

function PosDialogView({ pending, onSettle }: { pending: PendingDialog; onSettle: (id: number, key: string | null) => void }) {
  const { opts } = pending;
  const tone = TONES[opts.tone || 'info'];
  const actions = actionsOf(opts);
  const [runningKey, setRunningKey] = useState<string | null>(null);
  const closingRef = useRef(false);
  const backdrop = useRef(new Animated.Value(0)).current;
  const card = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(backdrop, { toValue: 1, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.spring(card, { toValue: 1, friction: 8, tension: 90, useNativeDriver: true }),
    ]).start();
    return () => { busyDialogIds.delete(pending.id); };
  }, [backdrop, card, pending.id]);

  const close = useCallback((key: string | null) => {
    if (closingRef.current) return;
    closingRef.current = true;
    Animated.parallel([
      Animated.timing(backdrop, { toValue: 0, duration: 140, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      Animated.timing(card, { toValue: 0, duration: 140, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]).start(() => onSettle(pending.id, key));
  }, [backdrop, card, onSettle, pending.id]);

  const dismissable = opts.dismissable !== false;
  const onBackdrop = () => {
    if (!dismissable || runningKey || closingRef.current) return;
    close(cancelKeyOf(opts));
  };

  // Root host (no surrounding Modal): Android back closes the dialog instead of leaving the screen
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onBackdrop();
      return true;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runningKey, dismissable]);

  const press = async (action: PosDialogAction<string>) => {
    if (runningKey || closingRef.current) return;
    if (action.onPress) {
      setRunningKey(action.key);
      busyDialogIds.add(pending.id);
      try {
        await action.onPress();
      } catch {
        busyDialogIds.delete(pending.id);
        setRunningKey(null);
        return;
      }
      busyDialogIds.delete(pending.id);
    }
    close(action.key);
  };

  const stacked = actions.length > 2;
  // Row layout: secondary on the left, primary/destructive on the right
  const ordered = stacked ? actions : [...actions].sort((a, b) => (a.style === 'secondary' ? -1 : 0) - (b.style === 'secondary' ? -1 : 0));

  return (
    <View style={[StyleSheet.absoluteFill, styles.layer]} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: backdrop }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onBackdrop} accessibilityLabel="Đóng hộp thoại" />
      </Animated.View>
      <View style={styles.center} pointerEvents="box-none">
        <Animated.View
          style={[
            styles.cardShadow,
            {
              opacity: card,
              transform: [{ scale: card.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }],
            },
          ]}
        >
          <View className="bg-white rounded-2xl p-5 border border-slate-100" accessibilityRole="alert">
            <View className="items-center">
              <View
                className="w-12 h-12 rounded-full items-center justify-center mb-3"
                style={{ backgroundColor: tone.bg, borderWidth: 1, borderColor: tone.border }}
              >
                <Feather name={opts.icon || tone.icon} size={22} color={tone.color} />
              </View>
              <Text className="text-base font-bold text-slate-800 text-center">{opts.title}</Text>
              {!!opts.message && (
                <Text className="text-xs text-slate-500 text-center mt-1.5 leading-5">{opts.message}</Text>
              )}
            </View>

            <View className={stacked ? 'mt-5' : 'mt-5 flex-row'} style={stacked ? { gap: 8 } : { gap: 10 }}>
              {ordered.map((action) => {
                const style = action.style || 'primary';
                const running = runningKey === action.key;
                const disabled = !!runningKey && !running;
                const container =
                  style === 'primary' ? 'bg-orange-500 active:bg-orange-600 border border-orange-500'
                    : style === 'destructive' ? 'bg-rose-600 active:bg-rose-700 border border-rose-600'
                      : 'bg-white active:bg-slate-50 border border-slate-200';
                const textColor = style === 'secondary' ? 'text-slate-700' : 'text-white';
                return (
                  <TouchableOpacity
                    key={action.key}
                    activeOpacity={0.85}
                    disabled={!!runningKey}
                    onPress={() => { void press(action); }}
                    className={`h-11 px-3 rounded-xl flex-row items-center justify-center ${container} ${stacked ? '' : 'flex-1'}`}
                    style={disabled ? { opacity: 0.5 } : undefined}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !!runningKey, busy: running }}
                  >
                    {running && (
                      <ActivityIndicator size="small" color={style === 'secondary' ? '#fa5908' : '#ffffff'} style={{ marginRight: 8 }} />
                    )}
                    <Text className={`text-sm font-semibold ${textColor}`} numberOfLines={1}>
                      {running ? (action.loadingLabel || action.label) : action.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { zIndex: 100000, elevation: 100000 },
  backdrop: { backgroundColor: 'rgba(15, 23, 42, 0.55)' },
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  cardShadow: {
    width: '100%',
    maxWidth: 380,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 16,
  },
});

export default PosDialogHost;
