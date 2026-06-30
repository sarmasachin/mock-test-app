type Props = {
  /** Short label shown to the admin, e.g. "Home Content". */
  tabLabel?: string;
};

export function TabReadOnlyNotice({ tabLabel }: Props) {
  return (
    <p className="rbac-readonly-notice" role="status">
      <strong>View only.</strong>
      {tabLabel ? ` You can open ${tabLabel} but do not have permission to save changes.` : ' You do not have permission to save changes on this page.'}
      {' '}Ask a super admin to grant the matching checkbox under <em>Roles &amp; Permissions</em>.
    </p>
  );
}
