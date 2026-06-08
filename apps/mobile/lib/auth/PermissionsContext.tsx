import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';

interface PermissionsContextType {
  permissions: string[];
  hasPermission: (has: string | string[]) => boolean;
  reloadPermissions: () => Promise<void>;
  isLoading: boolean;
}

const PermissionsContext = createContext<PermissionsContextType>({
  permissions: [],
  hasPermission: () => false,
  reloadPermissions: async () => {},
  isLoading: true,
});

export function PermissionsProvider({ children }: { children: React.ReactNode }) {
  const [permissions, setPermissions] = useState<string[]>([]);
  const [roleCode, setRoleCode] = useState<string>('staff');
  const [isLoading, setIsLoading] = useState(true);

  const reloadPermissions = useCallback(async () => {
    try {
      const saved = await AsyncStorage.getItem('active_user_permissions');
      const savedRole = await AsyncStorage.getItem('active_user_role_code');
      
      if (saved) {
        setPermissions(JSON.parse(saved));
      } else {
        setPermissions([]);
      }
      
      if (savedRole) {
        setRoleCode(savedRole);
      } else {
        setRoleCode('staff');
      }
    } catch (err) {
      console.warn('[PermissionsProvider] Lỗi đọc permissions từ AsyncStorage:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    reloadPermissions();
  }, [reloadPermissions]);

  const hasPermission = useCallback(
    (has: string | string[]) => {
      // Vai trò owner/admin đặc biệt trên Mobile luôn có toàn quyền
      if (roleCode === 'owner' || roleCode === 'admin' || permissions.includes('*')) {
        return true;
      }

      return Array.isArray(has)
        ? has.some((p) => permissions.includes(p))
        : permissions.includes(has);
    },
    [permissions, roleCode]
  );

  return (
    <PermissionsContext.Provider value={{ permissions, hasPermission, reloadPermissions, isLoading }}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions() {
  return useContext(PermissionsContext);
}

interface HasPermissionProps {
  has: string | string[];
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export function HasPermission({ has, fallback = null, children }: HasPermissionProps) {
  const { hasPermission, isLoading } = usePermissions();

  if (isLoading) {
    return null; // Hoặc một skeleton nhỏ
  }

  if (!hasPermission(has)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
