import { useCallback, useEffect, useState } from 'react';
import type { AxiosInstance } from 'axios';
import { AdminPermissionsEditor } from './AdminPermissionsEditor';
import type { PermissionCatalog, PermissionCatalogGroup } from '../lib/adminRbac';
import { useAdminToast } from '../adminToast';

type Props = {
  apiClient: AxiosInstance;
  userId: string;
  userLabel: string;
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
};

export function AdminPermissionsModal({
  apiClient,
  userId,
  userLabel,
  open,
  onClose,
  onSaved,
}: Props) {
  const { pushToast } = useAdminToast();
  const [catalog, setCatalog] = useState<PermissionCatalog | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadCatalog = useCallback(async () => {
    const res = await apiClient.get('/admin/permissions/catalog');
    setCatalog(res.data?.catalog || null);
  }, [apiClient]);

  const loadPermissions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get(`/admin/users/${userId}/permissions`);
      const stored = Array.isArray(res.data?.storedPermissionKeys) ? res.data.storedPermissionKeys : [];
      setSelectedKeys(stored);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      pushToast('error', msg || 'Failed to load permissions');
      onClose();
    } finally {
      setLoading(false);
    }
  }, [apiClient, onClose, pushToast, userId]);

  useEffect(() => {
    if (!open) return;
    void loadCatalog();
    void loadPermissions();
  }, [loadCatalog, loadPermissions, open]);

  function toggleKey(key: string, checked: boolean) {
    setSelectedKeys((prev) => {
      const set = new Set(prev);
      if (checked) set.add(key);
      else set.delete(key);
      return [...set].sort();
    });
  }

  function toggleGroup(group: PermissionCatalogGroup, checked: boolean) {
    const keys = group.permissions.map((p) => p.key);
    setSelectedKeys((prev) => {
      const set = new Set(prev);
      keys.forEach((k) => {
        if (checked) set.add(k);
        else set.delete(k);
      });
      return [...set].sort();
    });
  }

  async function save() {
    setSaving(true);
    try {
      await apiClient.put(`/admin/users/${userId}/permissions`, { permissionKeys: selectedKeys });
      pushToast('success', 'Permissions saved.');
      onSaved?.();
      onClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      pushToast('error', msg || 'Failed to save permissions');
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="admin-dialog-overlay rbac-modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="admin-dialog-card rbac-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rbac-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="rbac-modal-title" className="admin-dialog-title">
          Set permissions — {userLabel}
        </h2>
        <p className="admin-dialog-description">
          Check each tab and action this admin may use. They must re-login after save to refresh the sidebar.
        </p>
        <div className="rbac-modal-body">
          <AdminPermissionsEditor
            catalog={catalog}
            selectedKeys={selectedKeys}
            onToggle={toggleKey}
            onToggleGroup={toggleGroup}
            disabled={loading || saving}
          />
        </div>
        <div className="admin-dialog-actions">
          <button type="button" className="admin-dialog-btn admin-dialog-btn--secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            className="admin-dialog-btn admin-dialog-btn--primary"
            onClick={() => void save()}
            disabled={loading || saving}
          >
            {saving ? 'Saving…' : 'Save permissions'}
          </button>
        </div>
      </div>
    </div>
  );
}
