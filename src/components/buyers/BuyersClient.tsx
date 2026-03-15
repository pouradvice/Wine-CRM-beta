'use client';
// src/components/buyers/BuyersClient.tsx

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { upsertContact } from '@/lib/data';
import { Slideover } from '@/components/ui/Slideover';
import { Button } from '@/components/ui/Button';
import type { Contact, ContactInsert, Account, PremiseType } from '@/types';
import styles from './BuyersClient.module.css';

interface BuyersClientProps {
  initialBuyers: Contact[];
  activeClients: Account[];
  teamId: string;
}

interface ContactForm {
  account_id: string;
  first_name: string;
  last_name: string;
  role: string;
  phone: string;
  email: string;
  premise_type: string;
  notes: string;
}

const emptyForm = (): ContactForm => ({
  account_id: '',
  first_name: '',
  last_name: '',
  role: '',
  phone: '',
  email: '',
  premise_type: '',
  notes: '',
});

function contactToForm(c: Contact): ContactForm {
  return {
    account_id: c.account_id,
    first_name: c.first_name,
    last_name: c.last_name ?? '',
    role: c.role ?? '',
    phone: c.phone ?? '',
    email: c.email ?? '',
    premise_type: c.premise_type ?? '',
    notes: c.notes ?? '',
  };
}

export function BuyersClient({ initialBuyers, activeClients, teamId }: BuyersClientProps) {
  const router = useRouter();
  const [contacts, setContacts] = useState<Contact[]>(initialBuyers);
  const [accountFilter, setAccountFilter] = useState('');
  const [search, setSearch] = useState('');
  const [slideoverOpen, setSlideoverOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [form, setForm] = useState<ContactForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<ContactForm>>({});

  // Build unique account list from contacts data
  const accountsInList = useMemo(() => {
    const seen = new Map<string, string>();
    contacts.forEach((c) => {
      if (c.account && !seen.has(c.account_id)) {
        seen.set(c.account_id, (c.account as Account).name);
      }
    });
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [contacts]);

  const filtered = useMemo(() => {
    return contacts.filter((c) => {
      const q = search.toLowerCase();
      const matchSearch = !q || c.first_name.toLowerCase().includes(q);
      const matchAccount = !accountFilter || c.account_id === accountFilter;
      return matchSearch && matchAccount;
    });
  }, [contacts, search, accountFilter]);

  const openAdd = () => {
    setEditingContact(null);
    setForm(emptyForm());
    setErrors({});
    setSaveError(null);
    setSlideoverOpen(true);
  };

  const openEdit = (c: Contact) => {
    setEditingContact(c);
    setForm(contactToForm(c));
    setErrors({});
    setSaveError(null);
    setSlideoverOpen(true);
  };

  const validate = (): boolean => {
    const errs: Partial<ContactForm> = {};
    if (!form.account_id) errs.account_id = 'Account is required';
    if (!form.first_name.trim()) errs.first_name = 'Contact name is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    setSaveError(null);

    const sb = createClient();
    try {
      const payload: ContactInsert & { id?: string } = {
        account_id: form.account_id,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim() || null,
        role: form.role || null,
        phone: form.phone || null,
        email: form.email || null,
        premise_type: (form.premise_type as PremiseType) || null,
        notes: form.notes || null,
        team_id: teamId,
        is_active: true,
        ...(editingContact ? { id: editingContact.id } : {}),
      };

      const saved = await upsertContact(sb, payload);

      // Re-attach account info for display
      const accountData = activeClients.find((a) => a.id === saved.account_id) ?? null;
      const savedWithAccount: Contact = { ...saved, account: accountData };

      if (editingContact) {
        setContacts((prev) => prev.map((c) => (c.id === saved.id ? savedWithAccount : c)));
      } else {
        setContacts((prev) => [savedWithAccount, ...prev]);
      }

      setSlideoverOpen(false);
      router.refresh();
    } catch (err) {
      const e = err as { error?: string; message?: string };
      setSaveError(e.error ?? e.message ?? 'Failed to save contact.');
    } finally {
      setSaving(false);
    }
  };

  const setField = <K extends keyof ContactForm>(key: K, value: ContactForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  return (
    <>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Contacts</h1>
        <Button variant="primary" onClick={openAdd}>Add Contact</Button>
      </div>

      <div className={styles.toolbar}>
        <input
          type="search"
          className={styles.searchInput}
          placeholder="Search by contact name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className={styles.filterSelect}
          value={accountFilter}
          onChange={(e) => setAccountFilter(e.target.value)}
        >
          <option value="">All accounts</option>
          {accountsInList.map(({ id, name }) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>
            {search || accountFilter ? 'No contacts match your filters' : 'No contacts yet'}
          </p>
          <p className={styles.emptyDesc}>
            {search || accountFilter
              ? 'Try adjusting your search or filter.'
              : 'Add contacts (sommeliers, GMs, owners) to track who you meet at each account.'}
          </p>
          {!search && !accountFilter && (
            <Button variant="primary" onClick={openAdd}>Add Contact</Button>
          )}
        </div>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Contact Name</th>
              <th>Role</th>
              <th>Account</th>
              <th>Premise Type</th>
              <th>Email</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className={styles.tableRow} onClick={() => openEdit(c)}>
                <td className={styles.nameCell}>{c.first_name}</td>
                <td>{c.role ?? '—'}</td>
                <td>{(c.account as Account | null)?.name ?? '—'}</td>
                <td>{c.premise_type ?? '—'}</td>
                <td>{c.email ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Slideover
        open={slideoverOpen}
        onClose={() => setSlideoverOpen(false)}
        title={editingContact ? 'Edit Contact' : 'Add Contact'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setSlideoverOpen(false)} disabled={saving}>Cancel</Button>
            <Button variant="primary" onClick={handleSave} loading={saving}>Save</Button>
          </>
        }
      >
        <div className={styles.formGrid}>
          <div className={`${styles.formField} ${styles.formGridFull}`}>
            <label className={styles.formLabel}>
              Account <span className={styles.required}>*</span>
            </label>
            <select
              className={styles.formSelect}
              value={form.account_id}
              onChange={(e) => setField('account_id', e.target.value)}
            >
              <option value="">Select account…</option>
              {activeClients.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            {errors.account_id && <span className={styles.formError}>{errors.account_id}</span>}
          </div>

          <div className={styles.formField}>
            <label className={styles.formLabel}>
              First Name <span className={styles.required}>*</span>
            </label>
            <input
              className={styles.formInput}
              value={form.first_name}
              onChange={(e) => setField('first_name', e.target.value)}
            />
            {errors.first_name && <span className={styles.formError}>{errors.first_name}</span>}
          </div>

          <div className={styles.formField}>
            <label className={styles.formLabel}>Last Name</label>
            <input
              className={styles.formInput}
              value={form.last_name}
              onChange={(e) => setField('last_name', e.target.value)}
            />
          </div>

          <div className={styles.formField}>
            <label className={styles.formLabel}>Role</label>
            <select className={styles.formSelect} value={form.role} onChange={(e) => setField('role', e.target.value)}>
              <option value="">Select role…</option>
              {['Sommelier', 'GM', 'Buyer', 'Owner', 'Other'].map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          <div className={styles.formField}>
            <label className={styles.formLabel}>Premise Type</label>
            <select className={styles.formSelect} value={form.premise_type} onChange={(e) => setField('premise_type', e.target.value)}>
              <option value="">Select type…</option>
              <option value="On-Premise">On-Premise</option>
              <option value="Off-Premise">Off-Premise</option>
            </select>
          </div>

          <div className={styles.formField}>
            <label className={styles.formLabel}>Phone</label>
            <input type="tel" className={styles.formInput} value={form.phone} onChange={(e) => setField('phone', e.target.value)} />
          </div>

          <div className={styles.formField}>
            <label className={styles.formLabel}>Email</label>
            <input type="email" className={styles.formInput} value={form.email} onChange={(e) => setField('email', e.target.value)} />
          </div>

          <div className={`${styles.formField} ${styles.formGridFull}`}>
            <label className={styles.formLabel}>Notes</label>
            <textarea className={styles.formTextarea} value={form.notes} onChange={(e) => setField('notes', e.target.value)} rows={3} />
          </div>

          {saveError && <p className={styles.saveError}>{saveError}</p>}
        </div>
      </Slideover>
    </>
  );
}
