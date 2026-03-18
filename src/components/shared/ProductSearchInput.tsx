'use client';
// src/components/shared/ProductSearchInput.tsx
// Reusable debounced product search input for forms.

import { useState, useEffect, useRef } from 'react';
import type { Product } from '@/types';

interface ProductSearchInputProps {
  onSelect: (product: Product) => void;
  excludeIds?: string[];
  placeholder?: string;
  className?: string;
  dropdownClassName?: string;
  itemClassName?: string;
}

export function ProductSearchInput({
  onSelect,
  excludeIds = [],
  placeholder = 'Search products…',
  className,
  dropdownClassName,
  itemClassName,
}: ProductSearchInputProps) {
  const [query, setQuery] = useState('');
  // rawResults holds the full API response; filtering by excludeIds is done at render time
  const [rawResults, setRawResults] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim()) {
      setRawResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/products?search=${encodeURIComponent(query)}&limit=20`,
        );
        const result = await res.json();
        setRawResults(result.data ?? []);
      } catch {
        setRawResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // Filter at render time so changes to excludeIds are reflected immediately
  const excludeSet = new Set(excludeIds);
  const results = rawResults.filter((p) => !excludeSet.has(p.id));

  const handleSelect = (product: Product) => {
    onSelect(product);
    setQuery('');
    setRawResults([]);
  };

  return (
    <div style={{ position: 'relative' }}>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={loading ? 'Searching…' : placeholder}
        className={className}
      />
      {results.length > 0 && (
        <ul
          className={dropdownClassName}
          style={
            !dropdownClassName
              ? {
                  position: 'absolute',
                  zIndex: 100,
                  top: '100%',
                  left: 0,
                  right: 0,
                  background: 'var(--surface)',
                  border: '1px solid var(--mist)',
                  borderRadius: 'var(--radius-md)',
                  listStyle: 'none',
                  margin: 0,
                  padding: 0,
                  boxShadow: 'var(--shadow-md)',
                  maxHeight: '220px',
                  overflowY: 'auto',
                }
              : undefined
          }
        >
          {results.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => handleSelect(p)}
                className={itemClassName}
                style={
                  !itemClassName
                    ? {
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        padding: 'var(--space-2) var(--space-3)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: 'var(--text-sm)',
                        color: 'var(--text)',
                        fontFamily: 'inherit',
                      }
                    : undefined
                }
              >
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--text-xs)',
                    color: 'var(--wine)',
                    fontWeight: 600,
                    marginRight: 'var(--space-2)',
                  }}
                >
                  {p.sku_number}
                </span>
                {p.wine_name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
