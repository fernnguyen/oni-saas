import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ActivityIndicator,
  Platform,
  StyleSheet,
  Animated,
  Linking,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApiBaseUrl, getApiHeaders } from '../../lib/api/config';

// ──────────────────────────── Types ────────────────────────────

interface PendingQrLogin {
  token: string;
  requestedHost: string;
  requestedTenantSlug: string | null;
}

// ──────────────────────────── QR URL Parser ────────────────────────────
// Same logic as Zalo mini app: parse URL with scheme oni:// or https://
// path /qr-login or /auth/qr-login, query params: token, origin, tenant_slug

function parseQrLoginContent(content: string): PendingQrLogin | null {
  try {
    const parsed = new URL(content);
    const isSupportedScheme =
      parsed.protocol === 'oni:' ||
      parsed.protocol === 'http:' ||
      parsed.protocol === 'https:';
    const isQrLoginPath =
      parsed.pathname === '/qr-login' || parsed.pathname === '/auth/qr-login';
    if (!isSupportedScheme || !isQrLoginPath) return null;

    const token = parsed.searchParams.get('token');
    if (!token) return null;

    return {
      token,
      requestedHost: parsed.searchParams.get('origin') || 'thiết bị web',
      requestedTenantSlug: parsed.searchParams.get('tenant_slug'),
    };
  } catch {
    return null;
  }
}

// ──────────────────────────── Scanner Overlay ────────────────────────────

function ScannerOverlay() {
  const cornerSize = 28;
  const cornerThickness = 3;
  const cornerColor = '#fa5908';

  const corners = [
    { top: 0, left: 0, borderTopWidth: cornerThickness, borderLeftWidth: cornerThickness },
    { top: 0, right: 0, borderTopWidth: cornerThickness, borderRightWidth: cornerThickness },
    { bottom: 0, left: 0, borderBottomWidth: cornerThickness, borderLeftWidth: cornerThickness },
    { bottom: 0, right: 0, borderBottomWidth: cornerThickness, borderRightWidth: cornerThickness },
  ];

  return (
    <View style={styles.overlayContainer} pointerEvents="none">
      {/* Dark edges */}
      <View style={styles.overlayTop} />
      <View style={styles.overlayMiddle}>
        <View style={styles.overlaySide} />
        {/* Scan frame */}
        <View style={styles.scanFrame}>
          {corners.map((corner, i) => (
            <View
              key={i}
              style={[
                styles.corner,
                { width: cornerSize, height: cornerSize, borderColor: cornerColor },
                corner as any,
              ]}
            />
          ))}
        </View>
        <View style={styles.overlaySide} />
      </View>
      <View style={styles.overlayBottom} />
    </View>
  );
}

// ──────────────────────────── Main Modal ────────────────────────────

export interface QRLoginModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: (host: string) => void;
  onError?: (message: string) => void;
}

export function QRLoginModal({ visible, onClose, onSuccess, onError }: QRLoginModalProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [pendingQrLogin, setPendingQrLogin] = useState<PendingQrLogin | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentTenantSlug, setCurrentTenantSlug] = useState<string | null>(null);

  // Load current tenant slug for mismatch warning
  useEffect(() => {
    AsyncStorage.getItem('active_tenant_code').then(setCurrentTenantSlug).catch(() => {});
  }, []);

  // Reset scanner state when modal opens
  useEffect(() => {
    if (visible) {
      setScanned(false);
      setPendingQrLogin(null);
      setIsSubmitting(false);
      setErrorMessage(null);
    }
  }, [visible]);

  // Auto-trigger system permission dialog when status is undetermined
  // (Apple guideline: request at the moment of need, from user action)
  useEffect(() => {
    if (visible && permission && permission.status === 'undetermined') {
      requestPermission();
    }
  }, [visible, permission]);

  const handleBarCodeScanned = useCallback(({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

    const parsed = parseQrLoginContent(data);
    if (!parsed) {
      // Not a valid ONI QR code — allow retry after brief pause
      setTimeout(() => setScanned(false), 1500);
      return;
    }

    setErrorMessage(null);
    setPendingQrLogin(parsed);
  }, [scanned]);

  const handleConfirm = useCallback(async () => {
    if (!pendingQrLogin) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const baseUrl = getApiBaseUrl();
      const headers = await getApiHeaders();

      const res = await fetch(`${baseUrl}/api/auth/qr-login/confirm`, {
        method: 'POST',
        headers: headers as HeadersInit,
        // Bearer JWT already in Authorization header via getApiHeaders().
        // Backend reads it to verify mobile user identity (Path B).
        body: JSON.stringify({ token: pendingQrLogin.token }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const msg = (errData as any).message || (errData as any).error || `Lỗi xác nhận (${res.status})`;
        throw new Error(msg);
      }

      const result = await res.json();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      // Close modal first, then fire success callback (Header shows toast)
      setPendingQrLogin(null);
      onClose();
      onSuccess?.(result.requestedHost || pendingQrLogin.requestedHost);
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      const msg = err?.message || 'Không thể xác nhận đăng nhập. Vui lòng thử lại!';
      setErrorMessage(msg);
      // Notify Header for toast as well
      onError?.(msg);
    } finally {
      setIsSubmitting(false);
    }
  }, [pendingQrLogin, onClose, onSuccess, onError]);

  const hasTenantMismatch =
    !!pendingQrLogin?.requestedTenantSlug &&
    !!currentTenantSlug &&
    pendingQrLogin.requestedTenantSlug !== currentTenantSlug;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
            <Ionicons name="close" size={22} color="#0f172a" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Quét mã đăng nhập</Text>
          <View style={{ width: 38 }} />
        </View>

        {/* Permission gate — 3 states matching BarcodeScannerModal pattern */}
        {!permission ? (
          // State 1: loading camera status
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#fa5908" />
            <Text style={styles.permissionLoadingText}>Đang kết nối camera...</Text>
          </View>
        ) : permission.status === 'undetermined' ? (
          // State 2: waiting for system dialog (auto-triggered by useEffect above)
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#fa5908" />
            <Text style={styles.permissionLoadingText}>Đang yêu cầu quyền camera...</Text>
          </View>
        ) : !permission.granted ? (
          // State 3: denied — guide user to Settings (same as BarcodeScannerModal)
          <View style={styles.centered}>
            <View style={styles.deniedCard}>
              <View style={styles.deniedIconRow}>
                <View style={styles.deniedIconWrap}>
                  <Ionicons name="camera-outline" size={28} color="#fa5908" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.deniedTitle}>Quyền Camera bị từ chối</Text>
                  <Text style={styles.deniedDesc}>
                    Để quét mã QR đăng nhập web, hãy cấp quyền camera trong Cài đặt thiết bị.
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                onPress={() => Linking.openSettings().catch(() => {})}
                style={styles.settingsBtn}
                activeOpacity={0.8}
              >
                <Ionicons name="settings-outline" size={16} color="white" />
                <Text style={styles.settingsBtnText}>Mở Cài đặt</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={onClose}
                style={styles.cancelPermissionBtn}
                activeOpacity={0.8}
              >
                <Text style={styles.cancelPermissionBtnText}>Đóng</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : !pendingQrLogin ? (
          // Scanner view
          <>
            <CameraView
              style={StyleSheet.absoluteFillObject}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
            />
            <ScannerOverlay />
            <View style={styles.instructionCard}>
              <Ionicons name="qr-code-outline" size={18} color="#fa5908" />
              <Text style={styles.instructionText}>
                Đưa camera vào mã QR hiển thị trên màn hình web để đăng nhập
              </Text>
            </View>
          </>
        ) : (
          // Confirmation view — same UI as Zalo mini app
          <View style={styles.centered}>
            <View style={styles.confirmCard}>
              {/* Icon */}
              <View style={styles.confirmIconWrap}>
                <Ionicons name="qr-code" size={36} color="#fa5908" />
              </View>

              <Text style={styles.confirmTitle}>Xác nhận đăng nhập web</Text>
              <Text style={styles.confirmDesc}>
                Bạn sắp đăng nhập cho{' '}
                <Text style={styles.confirmHost}>{pendingQrLogin.requestedHost}</Text>{' '}
                bằng tài khoản mobile hiện tại.
              </Text>

              {/* Info box */}
              <View style={styles.infoBox}>
                <View style={styles.infoIconWrap}>
                  <Ionicons name="shield-checkmark-outline" size={20} color="#16a34a" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoTitle}>Đăng nhập nhanh bằng ONI Mobile</Text>
                  <Text style={styles.infoSubtitle}>
                    Chỉ xác nhận nếu chính bạn đang mở web cần đăng nhập.
                  </Text>
                </View>
              </View>

              {/* Tenant mismatch warning */}
              {hasTenantMismatch && (
                <View style={styles.warningBox}>
                  <Text style={styles.warningTitle}>⚠ Cảnh báo cửa hàng khác</Text>
                  <Text style={styles.warningDesc}>
                    App đang làm việc với <Text style={{ fontWeight: '700' }}>{currentTenantSlug}</Text>, nhưng mã QR yêu cầu đăng nhập vào{' '}
                    <Text style={{ fontWeight: '700' }}>{pendingQrLogin.requestedTenantSlug}</Text>.
                    Bạn vẫn có thể tiếp tục nếu tài khoản thuộc cả hai.
                  </Text>
                </View>
              )}

              {/* Inline error message */}
              {errorMessage && (
                <View style={styles.errorBox}>
                  <Ionicons name="alert-circle-outline" size={15} color="#dc2626" />
                  <Text style={styles.errorText}>{errorMessage}</Text>
                </View>
              )}

              {/* Action buttons */}
              <View style={styles.actionRow}>
                <TouchableOpacity
                  onPress={() => { setPendingQrLogin(null); setScanned(false); setErrorMessage(null); }}
                  style={styles.cancelBtn}
                  disabled={isSubmitting}
                  activeOpacity={0.8}
                >
                  <Text style={styles.cancelBtnText}>Hủy</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleConfirm}
                  style={[styles.confirmBtn, isSubmitting && { opacity: 0.65 }]}
                  disabled={isSubmitting}
                  activeOpacity={0.8}
                >
                  {isSubmitting ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <Text style={styles.confirmBtnText}>Xác nhận</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

// ──────────────────────────── Styles ────────────────────────────

const SCAN_FRAME = 240;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'white',
    paddingHorizontal: 12,
    paddingTop: Platform.OS === 'ios' ? 52 : 16,
    paddingBottom: 12,
    zIndex: 10,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'white',
    paddingHorizontal: 24,
  },
  // Scanner overlay
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
  },
  overlayTop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  overlayMiddle: {
    flexDirection: 'row',
    height: SCAN_FRAME,
  },
  overlaySide: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  scanFrame: {
    width: SCAN_FRAME,
    height: SCAN_FRAME,
    position: 'relative',
  },
  overlayBottom: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  corner: {
    position: 'absolute',
    borderColor: '#fa5908',
  },
  instructionCard: {
    position: 'absolute',
    bottom: 60,
    left: 24,
    right: 24,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    zIndex: 3,
  },
  instructionText: {
    flex: 1,
    fontSize: 13,
    color: '#334155',
    fontWeight: '500',
    lineHeight: 19,
  },
  // ─── Permission gate styles (3-state: loading, undetermined, denied) ───
  permissionLoadingText: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '500',
    marginTop: 12,
    textAlign: 'center',
  },
  deniedCard: {
    width: '100%',
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  deniedIconRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#fed7aa',
    borderRadius: 14,
    padding: 14,
  },
  deniedIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#ffedd5',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  deniedTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
    marginTop: 2,
  },
  deniedDesc: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 6,
    lineHeight: 18,
  },
  settingsBtn: {
    marginTop: 16,
    backgroundColor: '#fa5908',
    borderRadius: 14,
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  settingsBtnText: {
    color: 'white',
    fontWeight: '700',
    fontSize: 14,
  },
  cancelPermissionBtn: {
    marginTop: 10,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelPermissionBtnText: {
    color: '#64748b',
    fontWeight: '600',
    fontSize: 14,
  },
  // Confirmation card
  confirmCard: {
    width: '100%',
    backgroundColor: 'white',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
    alignItems: 'center',
  },
  confirmIconWrap: {
    width: 68,
    height: 68,
    borderRadius: 20,
    backgroundColor: '#fff7ed',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#fed7aa',
  },
  confirmTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0f172a',
    textAlign: 'center',
  },
  confirmDesc: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  confirmHost: {
    fontWeight: '700',
    color: '#0f172a',
  },
  infoBox: {
    width: '100%',
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 16,
  },
  infoIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  infoSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 3,
    lineHeight: 17,
  },
  warningBox: {
    width: '100%',
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#fdba74',
    borderRadius: 14,
    padding: 14,
    marginTop: 12,
  },
  warningTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#c2410c',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  warningDesc: {
    fontSize: 12,
    color: '#9a3412',
    marginTop: 6,
    lineHeight: 18,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
    width: '100%',
  },
  cancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    color: '#475569',
    fontWeight: '700',
    fontSize: 14,
  },
  confirmBtn: {
    flex: 1,
    height: 44,
    borderRadius: 13,
    backgroundColor: '#16a34a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnText: {
    color: 'white',
    fontWeight: '700',
    fontSize: 14,
  },
  errorBox: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    color: '#dc2626',
    fontWeight: '500',
    lineHeight: 18,
  },
});

