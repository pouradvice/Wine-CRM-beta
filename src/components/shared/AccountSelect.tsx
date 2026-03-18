'use client';
// src/components/shared/AccountSelect.tsx
// Reusable account <select> dropdown for forms.

import type { Account } from '@/types';

interface AccountSelectProps {
  accounts: Account[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function AccountSelect({
  accounts,
  value,
  onChange,
  placeholder = 'Select account…',
  disabled = false,
  className,
}: AccountSelectProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={className}
    >
      <option value="">{placeholder}</option>
      {accounts.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
        </option>
      ))}
    </select>
  );
}
