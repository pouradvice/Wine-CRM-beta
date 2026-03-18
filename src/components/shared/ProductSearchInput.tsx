'use client';
// src/components/shared/ProductSearchInput.tsx
//
// Standalone debounced product search input + dropdown extracted from RecapForm.tsx.
//
// Props:
//   onSelect   — called when the user picks a product from the dropdown.
//                The component clears the input and closes the dropdown.
//   excludeIds — product ids already selected; these are filtered out of results.

import { useState, useEffect, useRef } from 'react';
import type { Product } from '@/types';
import styles from './ProductSearchInput.module.css';

interface Props {
  onSelect:    (product: Product) => void;
  excludeIds?: string[];
}

export function ProductSearchInput({ onSelect, excludeIds = [] }: Props) {
  const [productSearch, setProductSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);

    if (!productSearch.trim()) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/products?search=${encodeURIComponent(productSearch)}&limit=20`,
        );
        const result = await res.json();
        const excluded = new Set(excludeIds);
        setSearchResults(
          (result.data ?? []).filter((p: Product) => !excluded.has(p.id)),
        );
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  // excludeIds is intentionally omitted — only productSearch drives re-fetches.
  // Callers pass a stable array reference if they need live exclusion updates.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productSearch]);

  function handleSelect(product: Product) {
    onSelect(product);
    setProductSearch('');
    setSearchResults([]);
  }

  return (
    <div className={styles.productSearch}>
      <input
        type="search"
        className={styles.input}
        placeholder="Search by name or SKU…"
        value={productSearch}
        onChange={(e) => setProductSearch(e.target.value)}
      />

      {productSearch && (
        <ul className={styles.productDropdown}>
          {searching && (
            <li className={styles.productDropdownStatus}>Searching…</li>
          )}
          {!searching && searchResults.length === 0 && (
            <li className={styles.productDropdownStatus}>No results</li>
          )}
          {!searching && searchResults.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className={styles.productDropdownItem}
                onClick={() => handleSelect(p)}
              >
                <span className={styles.productSku}>{p.sku_number}</span>
                <span className={styles.productName}>{p.wine_name}</span>
                {p.type && <span className={styles.productType}>{p.type}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
