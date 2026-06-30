import { useCallback } from 'react';
import { useAdminToast } from '../adminToast';
import { useAdminRbac } from '../adminRbacContext';

/** Returns a checker that shows a toast and returns false when permission is missing. */
export function usePermissionGuard() {
  const rbac = useAdminRbac();
  const { pushToast } = useAdminToast();

  return useCallback(
    (permission: string, message = 'You do not have permission for this action.') => {
      if (rbac.has(permission)) return true;
      pushToast('error', message);
      return false;
    },
    [rbac, pushToast],
  );
}
