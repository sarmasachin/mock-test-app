import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AxiosInstance } from 'axios';
import { AdminPermissionsEditor } from '../components/AdminPermissionsEditor';
import type { PermissionCatalog, PermissionCatalogGroup } from '../lib/adminRbac';
import { useAdminToast } from '../adminToast';

type AdminUserRow = {
  id: string;
  email: string;
  display_name: string;
  is_admin: boolean;
  is_super_admin: boolean;
};

type Props = {
  apiClient: AxiosInstance;
  initialUserId?: string | null;
};

export function RolesPermissionsTab({ apiClient, initialUserId = null }: Props) {
  const { pushToast } = useAdminToast();
  const [catalog, setCatalog] = useState<PermissionCatalog | null>(null);
  const [admins, setAdmins] = useState<AdminUserRow[]>([]);
  const [adminQuery, setAdminQuery] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(initialUserId);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [implicitFull, setImplicitFull] = useState(false);
  const [loadingAdmins, setLoadingAdmins] = useState(true);
  const [loadingPerms, setLoadingPerms] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadCatalog = useCallback(async () => {
    const res = await apiClient.get('/admin/permissions/catalog');
    setCatalog(res.data?.catalog || null);
  }, [apiClient]);

  const loadAdmins = useCallback(async () => {
    setLoadingAdmins(true);
    try {
      const res = await apiClient.get('/admin/users', { params: { limit: 100, offset: 0, q: adminQuery.trim() } });
      const rows = (res.data?.items || []) as AdminUserRow[];
      setAdmins(rows.filter((u) => u.is_admin && !u.is_super_admin));
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      pushToast('error', msg || 'Failed to load admin users');
    } finally {
      setLoadingAdmins(false);
    }
  }, [adminQuery, apiClient, pushToast]);

  const loadUserPermissions = useCallback(
    async (userId: string) => {
      setLoadingPerms(true);
      try {
      const res = await apiClient.get(`/admin/users/${userId}/permissions`);
      const stored = Array.isArray(res.data?.storedPermissionKeys) ? res.data.storedPermissionKeys : [];
      setSelectedKeys(stored);
      setImplicitFull(Boolean(res.data?.implicitFullAccess));
      } catch (err: unknown) {
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
        pushToast('error', msg || 'Failed to load permissions');
        setSelectedKeys([]);
        setImplicitFull(false);
      } finally {
        setLoadingPerms(false);
      }
    },
    [apiClient, pushToast],
  );

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    void loadAdmins();
  }, [loadAdmins]);

  useEffect(() => {
    if (initialUserId) setSelectedUserId(initialUserId);
  }, [initialUserId]);

  useEffect(() => {
    if (!selectedUserId) {
      setSelectedKeys([]);
      setImplicitFull(false);
      return;
    }
    void loadUserPermissions(selectedUserId);
  }, [loadUserPermissions, selectedUserId]);

  const selectedAdmin = useMemo(
    () => admins.find((a) => a.id === selectedUserId) || null,
    [admins, selectedUserId],
  );

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

  async function savePermissions() {
    if (!selectedUserId) return;
    setSaving(true);
    try {
      await apiClient.put(`/admin/users/${selectedUserId}/permissions`, {
        permissionKeys: selectedKeys,
      });
      pushToast('success', 'Permissions saved. Admin must re-login to refresh menu.');
      await loadUserPermissions(selectedUserId);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      pushToast('error', msg || 'Failed to save permissions');
    } finally {
      setSaving(false);
    }
  }

  function selectAllCatalog() {
    if (!catalog) return;
    const all = catalog.groups.flatMap((g) => g.permissions.map((p) => p.key));
    setSelectedKeys([...new Set(all)].sort());
  }

  function clearAll() {
    setSelectedKeys([]);
  }

  const editorDisabled = loadingPerms || saving || !selectedUserId;

  return (
    <div className="rbac-page">
      <section className="panel-card rbac-admin-picker">
        <div className="panel-head">
          <h3>Select admin</h3>
        </div>
        <p className="rbac-hint">Super admins always have full access. Choose a regular admin to edit checkboxes.</p>
        <div className="inline-form">
          <input
            value={adminQuery}
            onChange={(e) => setAdminQuery(e.target.value)}
            placeholder="Search admin by email or name"
          />
          <button type="button" onClick={() => void loadAdmins()} disabled={loadingAdmins}>
            {loadingAdmins ? 'Loading…' : 'Search'}
          </button>
        </div>
        <div className="rbac-admin-list">
          {loadingAdmins ? <p className="rbac-hint">Loading admins…</p> : null}
          {!loadingAdmins && admins.length === 0 ? <p className="rbac-hint">No regular admins found.</p> : null}
          {admins.map((admin) => (
            <button
              key={admin.id}
              type="button"
              className={`rbac-admin-row${selectedUserId === admin.id ? ' active' : ''}`}
              onClick={() => setSelectedUserId(admin.id)}
            >
              <span className="rbac-admin-name">{admin.display_name || admin.email}</span>
              <span className="rbac-admin-email">{admin.email}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="panel-card rbac-permissions-panel">
        <div className="panel-head rbac-perm-head">
          <div>
            <h3>Permissions</h3>
            {selectedAdmin ? (
              <p className="rbac-hint">
                Editing: <strong>{selectedAdmin.display_name || selectedAdmin.email}</strong>
                {selectedKeys.length === 0
                  ? ' — no permissions yet; tick checkboxes below and click Save.'
                  : implicitFull
                    ? ' (full access)'
                    : ''}
              </p>
            ) : (
              <p className="rbac-hint">Select an admin from the left list.</p>
            )}
          </div>
          <div className="inline-form rbac-perm-actions">
            <button type="button" className="ghost" disabled={editorDisabled || !catalog} onClick={selectAllCatalog}>
              Select all
            </button>
            <button type="button" className="ghost" disabled={editorDisabled} onClick={clearAll}>
              Clear all
            </button>
            <button type="button" disabled={editorDisabled || !selectedUserId} onClick={() => void savePermissions()}>
              {saving ? 'Saving…' : 'Save permissions'}
            </button>
          </div>
        </div>

        <AdminPermissionsEditor
          catalog={catalog}
          selectedKeys={selectedKeys}
          onToggle={toggleKey}
          onToggleGroup={toggleGroup}
          disabled={editorDisabled}
        />
      </section>
    </div>
  );
}
