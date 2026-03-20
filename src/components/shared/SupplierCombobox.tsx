'use client';
// src/components/shared/SupplierCombobox.tsx
// Text input with autocomplete for selecting a supplier from the suppliers table.

import { useState, useRef, useEffect } from 'react';

interface Supplier {
  id:   string;
  name: string;
}

interface SupplierComboboxProps {
  suppliers:   Supplier[];
  value:       string;           // selected supplier id
  onChange:    (id: string) => void;
  placeholder?: string;
  disabled?:   boolean;
  className?:  string;
}

export function SupplierCombobox({
  suppliers,
  value,
  onChange,
  placeholder = 'Type to search suppliers…',
  disabled = false,
  className,
}: SupplierComboboxProps) {
  const selectedSupplier = suppliers.find((s) => s.id === value);
  const [inputText, setInputText] = useState(selectedSupplier?.name ?? '');
  const [open, setOpen]           = useState(false);
  const containerRef              = useRef<HTMLDivElement>(null);

  // Keep inputText in sync when the value changes externally
  useEffect(() => {
    const s = suppliers.find((s) => s.id === value);
    setInputText(s?.name ?? '');
  }, [value, suppliers]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        // If what's typed doesn't match a supplier, clear the selection
        const match = suppliers.find(
          (s) => s.name.toLowerCase() === inputText.trim().toLowerCase(),
        );
        if (!match) {
          setInputText('');
          if (value) onChange('');
        }
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [inputText, value, suppliers, onChange]);

  const query   = inputText.trim().toLowerCase();
  const matches = query
    ? suppliers.filter((s) => s.name.toLowerCase().includes(query))
    : suppliers;

  const handleSelect = (supplier: Supplier) => {
    setInputText(supplier.name);
    setOpen(false);
    onChange(supplier.id);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);
    setOpen(true);
    if (value) onChange('');
  };

  const dropdownVisible = open && matches.length > 0;

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <input
        type="text"
        value={inputText}
        onChange={handleInputChange}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        disabled={disabled}
        className={className}
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={dropdownVisible}
        aria-haspopup="listbox"
        role="combobox"
      />
      {dropdownVisible && (
        <ul
          role="listbox"
          style={{
            position:     'absolute',
            zIndex:       100,
            top:          'calc(100% + 4px)',
            left:         0,
            right:        0,
            background:   'var(--surface, #fff)',
            border:       '1px solid var(--mist, #e5e0d8)',
            borderRadius: '6px',
            listStyle:    'none',
            margin:       0,
            padding:      '0.25rem 0',
            boxShadow:    '0 4px 16px rgba(0,0,0,0.1)',
            maxHeight:    '240px',
            overflowY:    'auto',
          }}
        >
          {matches.map((s) => (
            <li key={s.id} role="option" aria-selected={s.id === value}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); handleSelect(s); }}
                style={{
                  display:    'block',
                  width:      '100%',
                  textAlign:  'left',
                  padding:    '0.625rem 0.875rem',
                  background: s.id === value ? 'var(--parchment, #f5f0e8)' : 'none',
                  border:     'none',
                  cursor:     'pointer',
                  fontSize:   '0.9rem',
                  color:      'var(--ink, #1a1a1a)',
                  fontFamily: 'inherit',
                }}
              >
                {s.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
