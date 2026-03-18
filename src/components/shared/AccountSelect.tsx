'use client';
// src/components/shared/AccountSelect.tsx
//
// Standalone account picker extracted from RecapForm.tsx.
// Renders a <select> populated with the provided accounts list.
//
// Props:
//   accounts  — list of Account objects to display as options
//   value     — currently selected account id ('' = none selected)
//   onChange  — called with the new account id when the selection changes
//   required  — whether the field is required (default: false)
//
// Note: The contact-prefill side-effect that lives in RecapForm is
// intentionally NOT included here — that logic belongs to RecapForm only.

import type { Account } from '@/types';
import styles from './AccountSelect.module.css';

interface Props {
  accounts:  Account[];
  value:     string;
  onChange:  (id: string) => void;
  required?: boolean;
}

export function AccountSelect({ accounts, value, onChange, required }: Props) {
  return (
    <select
      id="account_id"
      className={styles.select}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={required}
    >
      <option value="">Select account…</option>
      {accounts.map((a) => (
        <option key={a.id} value={a.id}>{a.name}</option>
      ))}
    </select>
  );
}
