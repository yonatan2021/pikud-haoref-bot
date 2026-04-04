import { getDb } from './schema.js';

export interface Contact {
  id: number;
  user_id: number;
  contact_id: number;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
}

export interface ContactPermissions {
  safety_status: boolean;
  home_city: boolean;
  update_time: boolean;
}

interface RawContact {
  id: number;
  user_id: number;
  contact_id: number;
  status: string;
  created_at: string;
}

interface RawPermissions {
  contact_id: number;
  safety_status: number;
  home_city: number;
  update_time: number;
}

function decodeContact(raw: RawContact): Contact {
  return {
    id: raw.id,
    user_id: raw.user_id,
    contact_id: raw.contact_id,
    status: raw.status as Contact['status'],
    created_at: raw.created_at,
  };
}

function decodePermissions(raw: RawPermissions): ContactPermissions {
  return {
    safety_status: raw.safety_status === 1,
    home_city: raw.home_city === 1,
    update_time: raw.update_time === 1,
  };
}

/** @internal — use createContactWithPermissions for all public flows to ensure permissions row is created atomically */
export function createContact(userId: number, contactId: number): Contact {
  if (userId === contactId) {
    throw new Error('Cannot create a contact with yourself');
  }
  const stmt = getDb().prepare(
    'INSERT INTO contacts (user_id, contact_id) VALUES (?, ?) RETURNING *'
  );
  const raw = stmt.get(userId, contactId) as RawContact;
  return decodeContact(raw);
}

/** Creates a contact AND its default permissions atomically in a single transaction. */
export function createContactWithPermissions(
  userId: number,
  contactId: number,
  defaults?: Partial<ContactPermissions>,
): Contact {
  const db = getDb();
  return db.transaction(() => {
    const contact = createContact(userId, contactId);
    createDefaultPermissions(contact.id, defaults);
    return contact;
  })();
}

export function getContactById(id: number): Contact | undefined {
  const raw = getDb()
    .prepare('SELECT * FROM contacts WHERE id = ?')
    .get(id) as RawContact | undefined;
  return raw ? decodeContact(raw) : undefined;
}

export function getContactByPair(userId: number, contactId: number): Contact | undefined {
  const raw = getDb()
    .prepare('SELECT * FROM contacts WHERE user_id = ? AND contact_id = ?')
    .get(userId, contactId) as RawContact | undefined;
  return raw ? decodeContact(raw) : undefined;
}

export function acceptContact(id: number): void {
  const result = getDb()
    .prepare("UPDATE contacts SET status = 'accepted' WHERE id = ?")
    .run(id);
  if (result.changes === 0) throw new Error(`Contact ${id} not found`);
}

export function rejectContact(id: number): void {
  const result = getDb()
    .prepare("UPDATE contacts SET status = 'rejected' WHERE id = ?")
    .run(id);
  if (result.changes === 0) throw new Error(`Contact ${id} not found`);
}

export function removeContact(id: number): void {
  const result = getDb()
    .prepare('DELETE FROM contacts WHERE id = ?')
    .run(id);
  if (result.changes === 0) throw new Error(`Contact ${id} not found`);
}

export function listContacts(userId: number, status?: string): Contact[] {
  const base = 'SELECT * FROM contacts WHERE (user_id = ? OR contact_id = ?)';
  const params: unknown[] = [userId, userId];

  if (status) {
    const rows = getDb()
      .prepare(`${base} AND status = ?`)
      .all(...params, status) as RawContact[];
    return rows.map(decodeContact);
  }

  const rows = getDb()
    .prepare(base)
    .all(...params) as RawContact[];
  return rows.map(decodeContact);
}

export function getPendingCountForUser(userId: number): number {
  const row = getDb()
    .prepare("SELECT COUNT(*) AS cnt FROM contacts WHERE contact_id = ? AND status = 'pending'")
    .get(userId) as { cnt: number };
  return row.cnt;
}

export function getPermissions(contactRowId: number): ContactPermissions | undefined {
  const raw = getDb()
    .prepare('SELECT * FROM contact_permissions WHERE contact_id = ?')
    .get(contactRowId) as RawPermissions | undefined;
  return raw ? decodePermissions(raw) : undefined;
}

export function createDefaultPermissions(
  contactRowId: number,
  defaults?: Partial<ContactPermissions>
): void {
  const safetyStatus = defaults?.safety_status !== undefined ? (defaults.safety_status ? 1 : 0) : 1;
  const homeCity = defaults?.home_city !== undefined ? (defaults.home_city ? 1 : 0) : 0;
  const updateTime = defaults?.update_time !== undefined ? (defaults.update_time ? 1 : 0) : 1;

  const result = getDb()
    .prepare(
      'INSERT INTO contact_permissions (contact_id, safety_status, home_city, update_time) VALUES (?, ?, ?, ?)'
    )
    .run(contactRowId, safetyStatus, homeCity, updateTime);
  if (result.changes === 0) {
    throw new Error(`Failed to create permissions for contact_id ${contactRowId}`);
  }
}

/** Delete pending contacts older than 7 days. Called on a recurring interval. */
export function pruneExpiredContacts(): number {
  const result = getDb()
    .prepare("DELETE FROM contacts WHERE status = 'pending' AND created_at < datetime('now', '-7 days')")
    .run();
  return result.changes;
}

export function updatePermissions(
  contactRowId: number,
  patch: Partial<ContactPermissions>
): void {
  const setClauses: string[] = [];
  const values: unknown[] = [];

  if (patch.safety_status !== undefined) {
    setClauses.push('safety_status = ?');
    values.push(patch.safety_status ? 1 : 0);
  }
  if (patch.home_city !== undefined) {
    setClauses.push('home_city = ?');
    values.push(patch.home_city ? 1 : 0);
  }
  if (patch.update_time !== undefined) {
    setClauses.push('update_time = ?');
    values.push(patch.update_time ? 1 : 0);
  }

  if (setClauses.length === 0) return;

  values.push(contactRowId);
  const result = getDb()
    .prepare(`UPDATE contact_permissions SET ${setClauses.join(', ')} WHERE contact_id = ?`)
    .run(...values);
  if (result.changes === 0) {
    throw new Error(`Contact permissions not found for contact_id ${contactRowId}`);
  }
}
