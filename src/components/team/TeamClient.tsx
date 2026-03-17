'use client';
// src/components/team/TeamClient.tsx

import { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import styles from './TeamClient.module.css';

export interface TeamMember {
  user_id: string;
  role: string;
  email: string;
  display_name: string;
}

interface TeamClientProps {
  members: TeamMember[];
  currentUserId: string;
}

const ROLE_LABELS: Record<string, string> = {
  owner:  'Owner',
  admin:  'Admin',
  member: 'Member',
};

export function TeamClient({ members: initialMembers, currentUserId }: TeamClientProps) {
  const router = useRouter();
  const [members, setMembers] = useState<TeamMember[]>(initialMembers);

  // Sync state when server re-renders after router.refresh()
  useEffect(() => {
    setMembers(initialMembers);
  }, [initialMembers]);
  const [email, setEmail] = useState('');
  const [role, setRole]   = useState<'member' | 'admin' | 'owner'>('member');
  const [addError, setAddError] = useState('');
  const [addSuccess, setAddSuccess] = useState('');
  const [isPending, startTransition] = useTransition();

  const refresh = () => {
    router.refresh();
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError('');
    setAddSuccess('');
    const res = await fetch('/api/team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), role }),
    });
    const data = await res.json();
    if (!res.ok) {
      setAddError(data.error ?? 'Failed to add user');
      return;
    }
    setAddSuccess(`${email.trim()} has been added to the team.`);
    setEmail('');
    if (data.member) {
      setMembers((prev) => {
        // Avoid duplicates if the member is already in the list
        if (prev.some((m) => m.user_id === data.member.user_id)) return prev;
        return [...prev, data.member];
      });
    }
    startTransition(() => refresh());
  };

  const handleRemove = async (member: TeamMember) => {
    if (!confirm(`Remove ${member.display_name || member.email} from the team?`)) return;
    const res = await fetch('/api/team', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: member.user_id }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error ?? 'Failed to remove member');
      return;
    }
    setMembers((prev) => prev.filter((m) => m.user_id !== member.user_id));
    startTransition(() => refresh());
  };

  const handleRoleChange = async (member: TeamMember, newRole: string) => {
    const res = await fetch('/api/team', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: member.user_id, role: newRole }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error ?? 'Failed to update role');
      return;
    }
    setMembers((prev) =>
      prev.map((m) => (m.user_id === member.user_id ? { ...m, role: newRole } : m)),
    );
    startTransition(() => refresh());
  };

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Team</h1>
      </header>

      {/* Add member form */}
      <section className={styles.card}>
        <h2 className={styles.sectionTitle}>Add a Team Member</h2>
        <p className={styles.sectionHint}>
          The person must have already signed up before you can add them.
        </p>
        <form className={styles.addForm} onSubmit={handleAdd}>
          <input
            type="email"
            className={styles.input}
            placeholder="colleague@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <select
            className={styles.roleSelect}
            value={role}
            onChange={(e) => setRole(e.target.value as 'member' | 'admin' | 'owner')}
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
            <option value="owner">Owner</option>
          </select>
          <Button type="submit" variant="primary" size="sm" loading={isPending}>
            Add
          </Button>
        </form>
        {addError   && <p className={styles.errorMsg}>{addError}</p>}
        {addSuccess && <p className={styles.successMsg}>{addSuccess}</p>}
      </section>

      {/* Member list */}
      <section className={styles.card}>
        <h2 className={styles.sectionTitle}>Current Members</h2>
        {members.length === 0 ? (
          <p className={styles.empty}>No members yet.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Name / Email</th>
                <th className={styles.th}>Role</th>
                <th className={styles.th} />
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.user_id} className={styles.tr}>
                  <td className={styles.td}>
                    <span className={styles.name}>{m.display_name || m.email}</span>
                    {m.display_name && (
                      <span className={styles.emailSub}>{m.email}</span>
                    )}
                  </td>
                  <td className={styles.td}>
                    {m.user_id === currentUserId ? (
                      <span className={styles.roleTag}>{ROLE_LABELS[m.role] ?? m.role}</span>
                    ) : (
                      <select
                        className={styles.roleSelectInline}
                        value={m.role}
                        onChange={(e) => handleRoleChange(m, e.target.value)}
                      >
                        <option value="member">Member</option>
                        <option value="admin">Admin</option>
                        <option value="owner">Owner</option>
                      </select>
                    )}
                  </td>
                  <td className={`${styles.td} ${styles.tdAction}`}>
                    {m.user_id !== currentUserId && (
                      <button
                        type="button"
                        className={styles.removeBtn}
                        onClick={() => handleRemove(m)}
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
