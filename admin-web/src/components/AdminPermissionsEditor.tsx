import type { PermissionCatalog, PermissionCatalogGroup } from '../lib/adminRbac';

type Props = {
  catalog: PermissionCatalog | null;
  selectedKeys: string[];
  onToggle: (key: string, checked: boolean) => void;
  onToggleGroup: (group: PermissionCatalogGroup, checked: boolean) => void;
  disabled?: boolean;
};

export function AdminPermissionsEditor({
  catalog,
  selectedKeys,
  onToggle,
  onToggleGroup,
  disabled = false,
}: Props) {
  const selected = new Set(selectedKeys);
  if (!catalog) {
    return <p className="rbac-hint">Loading permission catalog…</p>;
  }

  return (
    <div className="rbac-editor">
      {catalog.groups.map((group) => {
        const groupKeys = group.permissions.map((p) => p.key);
        const checkedCount = groupKeys.filter((k) => selected.has(k)).length;
        const allChecked = groupKeys.length > 0 && checkedCount === groupKeys.length;
        const someChecked = checkedCount > 0 && !allChecked;
        return (
          <section key={group.name} className="rbac-group-card">
            <div className="rbac-group-head">
              <label className="check-wrap rbac-group-select">
                <input
                  type="checkbox"
                  checked={allChecked}
                  ref={(el) => {
                    if (el) el.indeterminate = someChecked;
                  }}
                  disabled={disabled}
                  onChange={(e) => onToggleGroup(group, e.target.checked)}
                />
                <strong>{group.name}</strong>
                <span className="rbac-count">
                  {checkedCount}/{groupKeys.length}
                </span>
              </label>
            </div>
            <div className="rbac-check-grid">
              {group.permissions.map((perm) => (
                <label key={perm.key} className="check-wrap rbac-check-item">
                  <input
                    type="checkbox"
                    checked={selected.has(perm.key)}
                    disabled={disabled}
                    onChange={(e) => onToggle(perm.key, e.target.checked)}
                  />
                  <span>{perm.label}</span>
                  {perm.superOnlyDefault ? <em className="rbac-sensitive-tag">Sensitive</em> : null}
                </label>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
