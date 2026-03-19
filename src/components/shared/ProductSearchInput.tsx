'use client';
// src/components/shared/ProductSearchInput.tsx
// Reusable debounced product search input for forms.

import { useState, useEffect, useRef } from 'react';
import type { Product } from '@/types';
import styles from './ProductSearchInput.module.css';

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
    <div className={styles.productSearch}>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={loading ? 'Searching…' : placeholder}
        className={className ?? styles.input}
      />
      {results.length > 0 && (
        <ul className={dropdownClassName ?? styles.productDropdown}>
          {results.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => handleSelect(p)}
                className={itemClassName ?? styles.productDropdownItem}
              >
                <span className={styles.productSku}>{p.sku_number}</span>
                <span className={styles.productName}>{p.wine_name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
