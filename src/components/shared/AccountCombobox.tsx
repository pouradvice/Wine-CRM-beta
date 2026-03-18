'use client';
// src/components/shared/AccountCombobox.tsx
// Text input with autocomplete for selecting an existing account, or
// prompting to add a new one when no match is found.

import { useState, useRef, useEffect } from 'react';
import type { Account } from '@/types';

interface AccountComboboxProps {
  accounts:        Account[];
  value:           string;           // currently selected account id
  onChange:        (id: string) => void;
  onAddAccount:    (name: string) => void; // called when user wants to add a new account
  placeholder?:    string;
  disabled?:       boolean;
  required?:       boolean;
  className?:      string;           // applied to the <input>
  dropdownClassName?:     string;
  dropdownItemClassName?: string;
}

export function AccountCombobox({
  accounts,
  value,
  onChange,
  onAddAccount,
  placeholder = 'Type to search accounts…',
  disabled = false,
  required = false,
  className,
  dropdownClassName,
  dropdownItemClassName,
}: AccountComboboxProps) {
  // Display the selected account name, or whatever the user has typed.
  const selectedAccount = accounts.find((a) => a.id === value);
  const [inputText, setInputText]   = useState(selectedAccount?.name ?? '');
  const [open, setOpen]             = useState(false);
  const containerRef                = useRef<HTMLDivElement>(null);

  // Keep inputText in sync if the selected account changes from the outside
  // (e.g. after a new account is created and auto-selected).
  useEffect(() => {
    const acct = accounts.find((a) => a.id === value);
    setInputText(acct?.name ?? '');
  }, [value, accounts]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const query   = inputText.trim().toLowerCase();
  const matches = query
    ? accounts.filter((a) => a.name.toLowerCase().includes(query))
    : accounts;

  const exactMatch = accounts.some(
    (a) => a.name.toLowerCase() === query,
  );

  const showAddOption = query.length > 0 && !exactMatch;

  const handleSelect = (account: Account) => {
    setInputText(account.name);
    setOpen(false);
    onChange(account.id);
  };

  const handleAddNew = () => {
    setOpen(false);
    onAddAccount(inputText.trim());
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);
    setOpen(true);
    // Clear the selection if the user edits the text
    if (value) onChange('');
  };

  const handleFocus = () => setOpen(true);

  const dropdownVisible = open && (matches.length > 0 || showAddOption);

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <input
        type="text"
        value={inputText}
        onChange={handleInputChange}
        onFocus={handleFocus}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        className={className}
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={dropdownVisible}
        aria-haspopup="listbox"
        role="combobox"
      />
      {dropdownVisible && (
        <ul
          className={dropdownClassName}
          role="listbox"
          style={
            !dropdownClassName
              ? {
                  position:   'absolute',
                  zIndex:     100,
                  top:        'calc(100% + 4px)',
                  left:       0,
                  right:      0,
                  background: 'var(--surface, #fff)',
                  border:     '1px solid var(--mist, #e5e0d8)',
                  borderRadius: '6px',
                  listStyle:  'none',
                  margin:     0,
                  padding:    '0.25rem 0',
                  boxShadow:  '0 4px 16px rgba(0,0,0,0.1)',
                  maxHeight:  '240px',
                  overflowY:  'auto',
                }
              : undefined
          }
        >
          {matches.map((a) => (
            <li key={a.id} role="option" aria-selected={a.id === value}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); handleSelect(a); }}
                className={dropdownItemClassName}
                style={
                  !dropdownItemClassName
                    ? {
                        display:    'block',
                        width:      '100%',
                        textAlign:  'left',
                        padding:    '0.625rem 0.875rem',
                        background: a.id === value ? 'var(--parchment, #f5f0e8)' : 'none',
                        border:     'none',
                        cursor:     'pointer',
                        fontSize:   '0.9rem',
                        color:      'var(--ink, #1a1a1a)',
                        fontFamily: 'inherit',
                      }
                    : undefined
                }
              >
                {a.name}
              </button>
            </li>
          ))}
          {showAddOption && (
            <li role="option" aria-selected={false}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); handleAddNew(); }}
                className={dropdownItemClassName}
                style={
                  !dropdownItemClassName
                    ? {
                        display:    'block',
                        width:      '100%',
                        textAlign:  'left',
                        padding:    '0.625rem 0.875rem',
                        background: 'none',
                        border:     'none',
                        borderTop:  matches.length > 0 ? '1px solid var(--mist, #e5e0d8)' : 'none',
                        cursor:     'pointer',
                        fontSize:   '0.9rem',
                        color:      'var(--wine, #8b1a1a)',
                        fontFamily: 'inherit',
                        fontWeight: 500,
                      }
                    : {
                        color:      'var(--wine, #8b1a1a)',
                        fontWeight: 500,
                        borderTop:  matches.length > 0 ? '1px solid var(--mist, #e5e0d8)' : 'none',
                      }
                }
              >
                + Add &ldquo;{inputText.trim()}&rdquo; as new account
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
