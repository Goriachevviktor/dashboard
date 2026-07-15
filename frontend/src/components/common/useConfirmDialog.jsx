import { useCallback, useState } from 'react';
import { ConfirmDialog } from './ConfirmDialog.jsx';

export function useConfirmDialog() {
  const [request, setRequest] = useState(null);

  const confirm = useCallback((options) => new Promise(resolve => {
    setRequest({ ...options, resolve });
  }), []);

  const close = useCallback((result) => {
    setRequest(current => {
      if (current) current.resolve(result);
      return null;
    });
  }, []);

  const dialog = request ? (
    <ConfirmDialog
      {...request}
      onCancel={() => close(false)}
      onConfirm={() => close(true)}
    />
  ) : null;

  return [confirm, dialog];
}
