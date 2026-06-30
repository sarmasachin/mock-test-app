import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import {
  TAB_PERMISSION_BY_TAB,
  canAccessAdminTab,
  hasAdminPermission,
} from './lib/adminRbac';
import type { Tab } from './tabTypes';
import { SETTINGS_KEY_TO_PERMISSION } from './lib/adminRbacMaps';

export type AdminRbacContextValue = {
  permissionKeys: string[];
  implicitFullAccess: boolean;
  isSuperAdmin: boolean;
  has: (permission: string) => boolean;
  canEditTab: (tab: Tab) => boolean;
  canEditSettingsKey: (settingsKey: string) => boolean;
  canEditSettingsGlobal: boolean;
  canUploadBanner: boolean;
  canClearAuditLogs: boolean;
  canManageRoles: boolean;
  canBanUsers: boolean;
  canManageRbac: boolean;
  canAdvancedUserMgmt: boolean;
  canEditTests: boolean;
  canEditQuestions: boolean;
};

const AdminRbacContext = createContext<AdminRbacContextValue | null>(null);

type ProviderProps = {
  children: ReactNode;
  permissionKeys: string[];
  implicitFullAccess: boolean;
  isSuperAdmin: boolean;
  adminEmail?: string | null;
};

export function AdminRbacProvider({
  children,
  permissionKeys,
  implicitFullAccess,
  isSuperAdmin,
  adminEmail = null,
}: ProviderProps) {
  const has = useCallback(
    (permission: string) =>
      hasAdminPermission(permissionKeys, implicitFullAccess, isSuperAdmin, permission, adminEmail),
    [adminEmail, permissionKeys, implicitFullAccess, isSuperAdmin],
  );

  const canEditTab = useCallback(
    (tab: Tab) => canAccessAdminTab(tab, permissionKeys, implicitFullAccess, isSuperAdmin, adminEmail),
    [adminEmail, permissionKeys, implicitFullAccess, isSuperAdmin],
  );

  const canEditSettingsKey = useCallback(
    (settingsKey: string) => {
      const perm = SETTINGS_KEY_TO_PERMISSION[settingsKey];
      if (!perm) {
        return hasAdminPermission(permissionKeys, implicitFullAccess, isSuperAdmin, 'settings_global', adminEmail);
      }
      return hasAdminPermission(permissionKeys, implicitFullAccess, isSuperAdmin, perm, adminEmail);
    },
    [adminEmail, permissionKeys, implicitFullAccess, isSuperAdmin],
  );

  const value = useMemo<AdminRbacContextValue>(
    () => ({
      permissionKeys,
      implicitFullAccess,
      isSuperAdmin,
      has,
      canEditTab,
      canEditSettingsKey,
      canEditSettingsGlobal: has('settings_global'),
      canUploadBanner: has('uploads_banner'),
      canClearAuditLogs: has('audit_clear'),
      canManageRoles: has('users_manage_roles'),
      canBanUsers: has('users_ban'),
      canManageRbac: has('rbac_manage'),
      canAdvancedUserMgmt: has('tab_user_management_advanced'),
      canEditTests: has('tab_all_tests'),
      canEditQuestions: has('tab_all_tests') || has('tab_question_builder'),
    }),
    [canEditSettingsKey, canEditTab, has, implicitFullAccess, isSuperAdmin, permissionKeys],
  );

  return <AdminRbacContext.Provider value={value}>{children}</AdminRbacContext.Provider>;
}

export function useAdminRbac(): AdminRbacContextValue {
  const ctx = useContext(AdminRbacContext);
  if (!ctx) {
    throw new Error('useAdminRbac must be used inside AdminRbacProvider');
  }
  return ctx;
}

/** Permission key for a tab (for read-only notices). */
export function tabPermissionKey(tab: Tab): string | null {
  return TAB_PERMISSION_BY_TAB[tab];
}
