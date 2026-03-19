'use client';
// src/components/RecapForm/RecapForm.tsx
//
// Changes from Phase 1 baseline:
//   • No longer accepts a `products` prop — searches server-side via
//     GET /api/products?search=&limit=20 with 300 ms debounce.
//   • No longer accepts a `buyers` prop — fetches contacts from
//     GET /api/contacts?accountId= when the selected account changes.
//   • selectedProducts state holds the products already added to the recap
//     so their rows stay visible while the search field is in use.
//   • Punch-list additions:
//     - Event and Off-Premise Tasting visit types (checklist-only products)
//     - Menu Placement outcome with photo upload
//     - Discussed shows follow-up date instead of probability slider
//     - Occasion field for Event type
//     - Pre-fills contact from account's primary_contact_name

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { todayLocal } from '@/lib/dateUtils';
import type {
  Account,
  Contact,
  Product,
  RecapFormState,
  RecapFormProduct,
  RecapOutcome,
  RecapNature,
} from '@/types';
import { contactFullName } from '@/types';
import { AccountCombobox } from '@/components/shared/AccountCombobox';
import { ProductSearchInput } from '@/components/shared/ProductSearchInput';
import { Slideover } from '@/components/ui/Slideover';
import styles from './RecapForm.module.css';

const OUTCOMES: RecapOutcome[] = [
  'Yes Today',
  'Yes Later',
  'Maybe Later',
  'No',
  'Discussed',
  'Menu Placement',
];

const OUTCOME_COLORS: Record<RecapOutcome, string> = {
  'Yes Today':      'var(--outcome-yes)',
  'Yes Later':      'var(--outcome-later)',
  'Maybe Later':    'var(--outcome-maybe)',
  'No':             'var(--outcome-no)',
  'Discussed':      'var(--outcome-discussed)',
  'Menu Placement': 'var(--outcome-placement)',
};

/** Nature values that use the simplified checklist (no outcome/feedback). */
const CHECKLIST_NATURES: RecapNature[] = ['Event', 'Off-Premise Tasting'];

interface Props {
  clients:          Account[];
  currentUser:      string;
  initialValues?:   Partial<RecapFormState>;
  initialProducts?: Product[];
}

function buildDefaultProduct(product: Product): RecapFormProduct {
  return {
    product_id:        product.id,
    outcome:           'Discussed',
    order_probability: 0,
    buyer_feedback:    '',
    follow_up_date:    '',
    bill_date:         '',
    menu_placement:    false,
    menu_photo_url:    null,
  };
}

export function RecapForm({ clients, currentUser, initialValues, initialProducts }: Props) {
  const router = useRouter();
  const sb = createClient();
  const today = todayLocal();

  // ── Form state ───────────────────────────────────────────────
  const [form, setForm] = useState<RecapFormState>({
    visit_date:          today,
    salesperson:         currentUser,
    account_id:          '',
    contact_id:          null,
    contact_name:        '',
    nature:              'Sales Call',
    occasion:            '',
    expense_receipt_url: null,
    notes:               null,
    products:            [],
    ...initialValues,
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Local copy of the accounts list so newly-created accounts appear immediately.
  const [localClients, setLocalClients] = useState<Account[]>(clients);

  // ── Add Account slideover state ──────────────────────────────
  const [addAccountOpen, setAddAccountOpen]       = useState(false);
  const [newAccountName, setNewAccountName]       = useState('');
  const [newAccountType, setNewAccountType]       = useState('');
  const [addAccountSaving, setAddAccountSaving]   = useState(false);
  const [addAccountError, setAddAccountError]     = useState<string | null>(null);

  // Products already added — kept separately so rows don't disappear
  // when the user types in the search box.
  const [selectedProducts, setSelectedProducts] = useState<Product[]>(initialProducts ?? []);

  // Photo upload states: productId → uploading/uploaded
  const [photoUploading, setPhotoUploading] = useState<Record<string, boolean>>({});

  // Receipt upload state
  const [receiptUploading, setReceiptUploading] = useState(false);

  const isChecklistMode = CHECKLIST_NATURES.includes(form.nature);

  // ── Product management ────────────────────────────────────────
  const addProduct = useCallback((product: Product) => {
    setSelectedProducts((prev) => [...prev, product]);
    setForm((prev) => ({
      ...prev,
      products: [...prev.products, buildDefaultProduct(product)],
    }));
  }, []);

  const removeProduct = useCallback((productId: string) => {
    setSelectedProducts((prev) => prev.filter((p) => p.id !== productId));
    setForm((prev) => ({
      ...prev,
      products: prev.products.filter((p) => p.product_id !== productId),
    }));
  }, []);

  const updateProductField = useCallback(
    <K extends keyof RecapFormProduct>(
      productId: string,
      field: K,
      value: RecapFormProduct[K],
    ) => {
      setForm((prev) => ({
        ...prev,
        products: prev.products.map((p) =>
          p.product_id === productId ? { ...p, [field]: value } : p,
        ),
      }));
    },
    [],
  );

  // ── Receipt upload ────────────────────────────────────────────
  const handleReceiptUpload = async (file: File) => {
    setReceiptUploading(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `receipts/${Date.now()}-${safeName}`;
      const { error: uploadErr } = await sb.storage
        .from('expense-receipts')
        .upload(path, file, { upsert: true });
      if (uploadErr) throw uploadErr;

      const { data: urlData } = sb.storage.from('expense-receipts').getPublicUrl(path);
      setForm((f) => ({ ...f, expense_receipt_url: urlData.publicUrl }));
    } catch (err) {
      console.error('Receipt upload failed:', err);
      setError('Receipt upload failed. Please try again.');
    } finally {
      setReceiptUploading(false);
    }
  };

  // ── Photo upload ──────────────────────────────────────────────
  const handlePhotoUpload = async (productId: string, file: File) => {
    setPhotoUploading((prev) => ({ ...prev, [productId]: true }));
    try {
      const ext = file.name.split('.').pop() ?? 'jpg';
      const path = `${productId}-${Date.now()}.${ext}`;
      const { error: uploadErr } = await sb.storage
        .from('menu-photos')
        .upload(path, file, { upsert: true });
      if (uploadErr) throw uploadErr;

      const { data: urlData } = sb.storage.from('menu-photos').getPublicUrl(path);
      updateProductField(productId, 'menu_photo_url', urlData.publicUrl);
    } catch (err) {
      console.error('Photo upload failed:', err);
    } finally {
      setPhotoUploading((prev) => ({ ...prev, [productId]: false }));
    }
  };

  // ── Add Account (slideover) ───────────────────────────────────
  const openAddAccount = (name: string) => {
    setNewAccountName(name);
    setNewAccountType('');
    setAddAccountError(null);
    setAddAccountOpen(true);
  };

  const handleSaveNewAccount = async () => {
    if (!newAccountName.trim()) {
      setAddAccountError('Account name is required.');
      return;
    }
    setAddAccountSaving(true);
    setAddAccountError(null);
    try {
      const res = await fetch('/api/accounts/create', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          name:   newAccountName.trim(),
          type:   newAccountType || undefined,
          status: 'Active',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAddAccountError(data.error ?? 'Failed to create account.');
        return;
      }
      // Build a minimal Account object for local state.
      const newAcct: Account = {
        id:                   data.id,
        team_id:              '',
        name:                 newAccountName.trim(),
        type:                 (newAccountType as Account['type']) || null,
        value_tier:           null,
        phone:                null,
        email:                null,
        address:              null,
        city:                 null,
        state:                null,
        country:              null,
        account_lead:         null,
        primary_contact_id:   null,
        primary_contact_name: null,
        status:               'Active',
        notes:                null,
        is_active:            true,
        created_at:           data.created_at ?? '',
        updated_at:           data.created_at ?? '',
      };
      setLocalClients((prev) => [...prev, newAcct]);
      setForm((f) => ({ ...f, account_id: newAcct.id, contact_id: null, contact_name: '' }));
      setAddAccountOpen(false);
    } catch (err) {
      console.error('Failed to create account:', err);
      setAddAccountError('An unexpected error occurred.');
    } finally {
      setAddAccountSaving(false);
    }
  };

  // ── Submit ────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.account_id) {
      setError('Please select an account.');
      return;
    }
    if (form.products.length === 0) {
      setError('Add at least one product to this recap.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const { data: { user } } = await sb.auth.getUser();
      const p_recap = {
        visit_date:          form.visit_date,
        salesperson:         form.salesperson,
        user_id:             user?.id ?? null,
        account_id:          form.account_id,
        contact_id:          form.contact_id || '',
        nature:              form.nature,
        occasion:            form.occasion || '',
        expense_receipt_url: form.expense_receipt_url || '',
        notes:               form.notes || '',
      };

      // For checklist visit types (Event, Off-Premise Tasting), override
      // outcome to 'Discussed' and clear probability since there's no feedback.
      const p_products = form.products.map((p) => {
        const isChecklist = isChecklistMode;
        return {
          product_id:        p.product_id,
          outcome:           isChecklist ? 'Discussed' : p.outcome,
          order_probability: isChecklist ? '' : (p.order_probability ? String(p.order_probability) : ''),
          buyer_feedback:    isChecklist ? '' : (p.buyer_feedback || ''),
          follow_up_date:    p.follow_up_date || '',
          bill_date:         isChecklist ? '' : (p.bill_date || ''),
          menu_placement:    p.menu_placement ? 'true' : 'false',
          menu_photo_url:    p.menu_photo_url || '',
        };
      });

      const res = await fetch('/api/recap/save', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ recap: p_recap, products: p_products }),
      });
      const result = await res.json();
      if (!res.ok) {
        setError(result.error ?? 'Failed to save recap. Please try again.');
        setSaving(false);
        return;
      }

      // Store contact_name (free-text account lead) — separate update since it's
      // not part of the save_recap RPC signature.
      if (form.contact_name) {
        await sb.from('recaps').update({ contact_name: form.contact_name }).eq('id', result.recap_id);
      }

      if (result.redirect_to_plan) {
        window.location.href = '/app/crm/plan/review';
      } else {
        window.location.href = `/app/crm/history?highlight=${result.recap_id}`;
      }
    } catch (err) {
      const e = err as { error?: string; message?: string };
      setError(e.error ?? e.message ?? 'Failed to save recap. Please try again.');
      setSaving(false);
    }
  };

  const getFormProduct = (productId: string) =>
    form.products.find((p) => p.product_id === productId);

  // Derive notes label based on visit type
  const notesLabel =
    form.nature === 'Event'             ? 'Event Notes' :
    form.nature === 'Off-Premise Tasting' ? 'Demo Notes'  :
    'Visit Notes';

  return (
    <>
    <form className={styles.form} onSubmit={handleSubmit} noValidate>

      {/* ── Visit Details ──────────────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Visit Details</h2>

        <div className={styles.row}>
          <div className={styles.field}>
            <label htmlFor="visit_date" className={styles.label}>Date</label>
            <input
              id="visit_date"
              type="date"
              className={styles.input}
              value={form.visit_date}
              max={today}
              onChange={(e) => setForm((f) => ({ ...f, visit_date: e.target.value }))}
              required
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="nature" className={styles.label}>Visit Type</label>
            <select
              id="nature"
              className={styles.select}
              value={form.nature}
              onChange={(e) =>
                setForm((f) => ({ ...f, nature: e.target.value as RecapNature }))
              }
            >
              <option value="Sales Call">Sales Call</option>
              <option value="Depletion Meeting">Depletion Meeting</option>
              <option value="Event">Event</option>
              <option value="Off-Premise Tasting">Off-Premise Tasting</option>
            </select>
          </div>

          <div className={styles.field}>
            <label htmlFor="salesperson" className={styles.label}>Salesperson</label>
            <input
              id="salesperson"
              type="text"
              className={styles.input}
              value={form.salesperson}
              readOnly
            />
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.field}>
            <label htmlFor="account_id" className={styles.label}>
              Account <span className={styles.required}>*</span>
            </label>
            <AccountCombobox
              accounts={localClients}
              value={form.account_id}
              onChange={(accountId) => {
                const acct = localClients.find((c) => c.id === accountId);
                // Pre-fill contact: prefer primary_contact_name, then account_lead
                const contactPreFill = acct?.primary_contact_name ?? acct?.account_lead ?? '';
                setForm((f) => ({
                  ...f,
                  account_id:   accountId,
                  contact_id:   null,
                  contact_name: contactPreFill,
                }));
                // Also check for structured primary contact record
                if (acct?.primary_contact_id && accountId && !acct.primary_contact_name) {
                  fetch(`/api/contacts?accountId=${accountId}&pageSize=100`)
                    .then((res) => res.json())
                    .then((result) => {
                      const contacts: Contact[] = result.data ?? [];
                      const primary = contacts.find((c) => c.id === acct.primary_contact_id);
                      if (primary) {
                        setForm((f) => ({ ...f, contact_name: contactFullName(primary) }));
                      }
                    })
                    .catch((err) => { console.error('Failed to fetch primary contact:', err); });
                }
              }}
              onAddAccount={openAddAccount}
              className={styles.input}
              dropdownClassName={styles.productDropdown}
              dropdownItemClassName={styles.productDropdownItem}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="contact_name" className={styles.label}>Contact</label>
            <input
              id="contact_name"
              type="text"
              className={styles.input}
              value={form.contact_name}
              placeholder="Account lead or contact name"
              onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))}
            />
          </div>
        </div>

        {/* Occasion — only shown for Event type */}
        {form.nature === 'Event' && (
          <div className={styles.field}>
            <label htmlFor="occasion" className={styles.label}>Occasion</label>
            <input
              id="occasion"
              type="text"
              className={styles.input}
              placeholder="e.g. Grand Opening, Wine Dinner, Corporate Event…"
              value={form.occasion}
              onChange={(e) => setForm((f) => ({ ...f, occasion: e.target.value }))}
            />
          </div>
        )}

        <div className={styles.field}>
          <label htmlFor="notes" className={styles.label}>{notesLabel}</label>
          <textarea
            id="notes"
            className={styles.textarea}
            rows={3}
            placeholder="General notes about this visit…"
            value={form.notes ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="expense_receipt" className={styles.label}>Expense Receipt</label>
          <input
            id="expense_receipt"
            type="file"
            accept="image/*,application/pdf"
            className={styles.input}
            disabled={receiptUploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleReceiptUpload(file);
            }}
          />
          {receiptUploading && (
            <span className={styles.uploadingHint}>Uploading…</span>
          )}
          {form.expense_receipt_url && !receiptUploading && (
            <a
              href={form.expense_receipt_url}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.photoLink}
            >
              View uploaded receipt →
            </a>
          )}
        </div>
      </section>

      {/* ── Products Shown ─────────────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Products Shown</h2>

        {/* Debounced product search */}
        <ProductSearchInput
          onSelect={addProduct}
          excludeIds={form.products.map((p) => p.product_id)}
        />

        {form.products.length === 0 && (
          <p className={styles.emptyHint}>
            Search for products above to add them to this recap.
          </p>
        )}

        {/* Product rows — simplified checklist for Event/Off-Premise Tasting */}
        {selectedProducts.map((product) => {
          const fp = getFormProduct(product.id);
          if (!fp) return null;

          if (isChecklistMode) {
            // Checklist mode: just show product name + remove button
            return (
              <div key={product.id} className={styles.productRow}>
                <div className={styles.productRowHeader}>
                  <div className={styles.productRowTitle}>
                    <span className={styles.productSku}>{product.sku_number}</span>
                    <span className={styles.productName}>{product.wine_name}</span>
                  </div>
                  <button
                    type="button"
                    className={styles.removeBtn}
                    onClick={() => removeProduct(product.id)}
                    aria-label="Remove product"
                  >
                    ×
                  </button>
                </div>
              </div>
            );
          }

          // Standard mode: full outcome/feedback UI
          return (
            <div key={product.id} className={styles.productRow}>
              <div className={styles.productRowHeader}>
                <div className={styles.productRowTitle}>
                  <span className={styles.productSku}>{product.sku_number}</span>
                  <span className={styles.productName}>{product.wine_name}</span>
                </div>
                <button
                  type="button"
                  className={styles.removeBtn}
                  onClick={() => removeProduct(product.id)}
                  aria-label="Remove product"
                >
                  ×
                </button>
              </div>

              <div className={styles.outcomeButtons}>
                {OUTCOMES.map((outcome) => (
                  <button
                    key={outcome}
                    type="button"
                    className={`${styles.outcomeBtn} ${
                      fp.outcome === outcome ? styles.outcomeBtnActive : ''
                    }`}
                    style={
                      fp.outcome === outcome
                        ? { background: OUTCOME_COLORS[outcome] }
                        : {}
                    }
                    onClick={() => {
                      updateProductField(product.id, 'outcome', outcome);
                      if (outcome === 'Yes Today' || outcome === 'Menu Placement') {
                        updateProductField(product.id, 'order_probability', 100);
                      } else if (outcome === 'No') {
                        updateProductField(product.id, 'order_probability', 0);
                      } else if (outcome === 'Discussed') {
                        updateProductField(product.id, 'order_probability', null);
                      }
                    }}
                  >
                    {outcome}
                  </button>
                ))}
              </div>

              {fp.outcome === 'Yes Later' && (
                <div className={styles.row}>
                  <div className={styles.field}>
                    <label className={styles.label}>Bill Date</label>
                    <input
                      type="date"
                      className={styles.input}
                      value={fp.bill_date ?? ''}
                      onChange={(e) =>
                        updateProductField(product.id, 'bill_date', e.target.value)
                      }
                    />
                  </div>
                </div>
              )}

              {(fp.outcome === 'Maybe Later' || fp.outcome === 'Discussed') && (
                <div className={styles.row}>
                  <div className={styles.field}>
                    <label className={styles.label}>Follow-up / Tasting Date</label>
                    <input
                      type="date"
                      className={styles.input}
                      value={fp.follow_up_date ?? ''}
                      onChange={(e) =>
                        updateProductField(product.id, 'follow_up_date', e.target.value)
                      }
                    />
                  </div>
                </div>
              )}

              {fp.outcome === 'Menu Placement' && (
                <div className={styles.row}>
                  <div className={styles.field}>
                    <label className={styles.label}>Menu Photo (Proof)</label>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className={styles.input}
                      disabled={photoUploading[product.id]}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handlePhotoUpload(product.id, file);
                      }}
                    />
                    {photoUploading[product.id] && (
                      <span className={styles.uploadingHint}>Uploading…</span>
                    )}
                    {fp.menu_photo_url && !photoUploading[product.id] && (
                      <a
                        href={fp.menu_photo_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.photoLink}
                      >
                        View uploaded photo →
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* Order Probability: hidden for Discussed, Yes Today (locked at 100), No (locked at 0) */}
              {fp.outcome !== 'Discussed' && (
                <div className={styles.row}>
                  <div className={styles.field}>
                    <label className={styles.label}>
                      Order Probability ({fp.order_probability ?? 0}%)
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      className={styles.range}
                      value={fp.order_probability ?? 0}
                      disabled={
                        fp.outcome === 'Yes Today' ||
                        fp.outcome === 'No' ||
                        fp.outcome === 'Menu Placement'
                      }
                      onChange={(e) =>
                        updateProductField(
                          product.id,
                          'order_probability',
                          Number(e.target.value),
                        )
                      }
                    />
                  </div>

                  <div className={styles.field}>
                    <label className={styles.label}>Buyer Feedback</label>
                    <input
                      type="text"
                      className={styles.input}
                      placeholder="Brief note…"
                      value={fp.buyer_feedback ?? ''}
                      onChange={(e) =>
                        updateProductField(product.id, 'buyer_feedback', e.target.value)
                      }
                    />
                  </div>
                </div>
              )}

              {/* Menu Placement toggle (independent of outcome) */}
              <div className={styles.menuPlacementRow}>
                <input
                  type="checkbox"
                  id={`menu-placement-${product.id}`}
                  checked={fp.menu_placement}
                  onChange={(e) =>
                    updateProductField(product.id, 'menu_placement', e.target.checked)
                  }
                />
                <label
                  htmlFor={`menu-placement-${product.id}`}
                  className={styles.menuPlacementLabel}
                >
                  Menu Placement
                </label>
              </div>
            </div>
          );
        })}
      </section>

      {/* ── Actions ───────────────────────────────────── */}
      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.cancelBtn}
          onClick={() => router.back()}
          disabled={saving}
        >
          Cancel
        </button>
        <button type="submit" className={styles.saveBtn} disabled={saving}>
          {saving ? 'Saving…' : 'Save Recap'}
        </button>
      </div>
    </form>

    {/* ── Add Account Slideover ─────────────────────────── */}
    <Slideover
      open={addAccountOpen}
      onClose={() => setAddAccountOpen(false)}
      title="Add New Account"
      footer={
        <>
          <button
            type="button"
            className={styles.cancelBtn}
            onClick={() => setAddAccountOpen(false)}
            disabled={addAccountSaving}
          >
            Cancel
          </button>
          <button
            type="button"
            className={styles.saveBtn}
            onClick={handleSaveNewAccount}
            disabled={addAccountSaving}
          >
            {addAccountSaving ? 'Saving…' : 'Save Account'}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div className={styles.field}>
          <label className={styles.label}>
            Name <span className={styles.required}>*</span>
          </label>
          <input
            type="text"
            className={styles.input}
            value={newAccountName}
            onChange={(e) => setNewAccountName(e.target.value)}
            placeholder="Account name"
            autoFocus
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Type</label>
          <select
            className={styles.select}
            value={newAccountType}
            onChange={(e) => setNewAccountType(e.target.value)}
          >
            <option value="">— Select type —</option>
            <option value="Restaurant">Restaurant</option>
            <option value="Bar">Bar</option>
            <option value="Retail">Retail</option>
            <option value="Hotel">Hotel</option>
            <option value="Club">Club</option>
            <option value="Corporate">Corporate</option>
            <option value="Other">Other</option>
          </select>
        </div>

        {addAccountError && (
          <p className={styles.error}>{addAccountError}</p>
        )}
      </div>
    </Slideover>
    </>
  );
}

