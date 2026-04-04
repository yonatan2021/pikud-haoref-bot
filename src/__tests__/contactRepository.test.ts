import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { initDb, getDb, closeDb } from '../db/schema';
import { upsertUser } from '../db/userRepository';
import {
  createContact,
  createContactWithPermissions,
  getContactById,
  getContactByPair,
  acceptContact,
  rejectContact,
  removeContact,
  listContacts,
  getPendingCountForUser,
  getPermissions,
  createDefaultPermissions,
  updatePermissions,
  pruneExpiredContacts,
} from '../db/contactRepository';

const USER_A = 1001;
const USER_B = 1002;
const USER_C = 1003;

describe('contacts schema', () => {
  before(() => { initDb(); });
  after(() => { closeDb(); });

  it('contacts table exists after initSchema', () => {
    const row = getDb()
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='contacts'")
      .get();
    assert.ok(row, 'contacts table should exist');
  });

  it('contact_permissions table exists after initSchema', () => {
    const row = getDb()
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='contact_permissions'")
      .get();
    assert.ok(row, 'contact_permissions table should exist');
  });

  it('initSchema() twice does not throw', () => {
    const { initSchema } = require('../db/schema');
    assert.doesNotThrow(() => initSchema(getDb()));
  });
});

describe('contactRepository', () => {
  before(() => { initDb(); });
  after(() => { closeDb(); });

  beforeEach(() => {
    getDb().prepare('DELETE FROM contact_permissions').run();
    getDb().prepare('DELETE FROM contacts').run();
    getDb().prepare('DELETE FROM users').run();
    upsertUser(USER_A);
    upsertUser(USER_B);
    upsertUser(USER_C);
  });

  it('createContact returns a valid Contact', () => {
    const contact = createContact(USER_A, USER_B);
    assert.equal(contact.user_id, USER_A);
    assert.equal(contact.contact_id, USER_B);
    assert.equal(contact.status, 'pending');
    assert.ok(contact.id > 0);
    assert.ok(contact.created_at);
  });

  it('self-connection throws error', () => {
    assert.throws(
      () => createContact(USER_A, USER_A),
      { message: 'Cannot create a contact with yourself' }
    );
  });

  it('duplicate pair throws error', () => {
    createContact(USER_A, USER_B);
    assert.throws(() => createContact(USER_A, USER_B));
  });

  it('getContactById returns the contact', () => {
    const created = createContact(USER_A, USER_B);
    const found = getContactById(created.id);
    assert.ok(found);
    assert.equal(found!.id, created.id);
    assert.equal(found!.user_id, USER_A);
  });

  it('getContactById returns undefined for missing id', () => {
    assert.equal(getContactById(99999), undefined);
  });

  it('getContactByPair returns the contact', () => {
    createContact(USER_A, USER_B);
    const found = getContactByPair(USER_A, USER_B);
    assert.ok(found);
    assert.equal(found!.user_id, USER_A);
    assert.equal(found!.contact_id, USER_B);
  });

  it('getContactByPair returns undefined for reverse pair', () => {
    createContact(USER_A, USER_B);
    assert.equal(getContactByPair(USER_B, USER_A), undefined);
  });

  it('acceptContact changes status to accepted', () => {
    const c = createContact(USER_A, USER_B);
    acceptContact(c.id);
    const updated = getContactById(c.id);
    assert.equal(updated!.status, 'accepted');
  });

  it('rejectContact changes status to rejected', () => {
    const c = createContact(USER_A, USER_B);
    rejectContact(c.id);
    const updated = getContactById(c.id);
    assert.equal(updated!.status, 'rejected');
  });

  it('removeContact deletes the row', () => {
    const c = createContact(USER_A, USER_B);
    removeContact(c.id);
    assert.equal(getContactById(c.id), undefined);
  });

  it('listContacts returns both directions (bidirectional)', () => {
    createContact(USER_A, USER_B); // A sent to B
    createContact(USER_C, USER_A); // C sent to A
    const contacts = listContacts(USER_A);
    assert.equal(contacts.length, 2);
  });

  it('listContacts filters by status', () => {
    const c1 = createContact(USER_A, USER_B);
    createContact(USER_A, USER_C);
    acceptContact(c1.id);

    const accepted = listContacts(USER_A, 'accepted');
    assert.equal(accepted.length, 1);
    assert.equal(accepted[0].status, 'accepted');

    const pending = listContacts(USER_A, 'pending');
    assert.equal(pending.length, 1);
    assert.equal(pending[0].status, 'pending');
  });

  it('getPendingCountForUser counts incoming pending requests', () => {
    createContact(USER_A, USER_B); // A → B (pending)
    createContact(USER_C, USER_B); // C → B (pending)
    createContact(USER_A, USER_C); // A → C (pending)

    assert.equal(getPendingCountForUser(USER_B), 2);
    assert.equal(getPendingCountForUser(USER_C), 1);
    assert.equal(getPendingCountForUser(USER_A), 0);
  });

  it('createDefaultPermissions + getPermissions round-trip with boolean decoding', () => {
    const c = createContact(USER_A, USER_B);
    createDefaultPermissions(c.id);
    const perms = getPermissions(c.id);
    assert.ok(perms);
    assert.equal(perms!.safety_status, true);
    assert.equal(perms!.home_city, false);
    assert.equal(perms!.update_time, true);
  });

  it('createDefaultPermissions accepts custom defaults', () => {
    const c = createContact(USER_A, USER_B);
    createDefaultPermissions(c.id, { safety_status: false, home_city: true });
    const perms = getPermissions(c.id);
    assert.ok(perms);
    assert.equal(perms!.safety_status, false);
    assert.equal(perms!.home_city, true);
    assert.equal(perms!.update_time, true); // default
  });

  it('getPermissions returns undefined when no permissions exist', () => {
    const c = createContact(USER_A, USER_B);
    assert.equal(getPermissions(c.id), undefined);
  });

  it('updatePermissions updates without clobbering other fields', () => {
    const c = createContact(USER_A, USER_B);
    createDefaultPermissions(c.id); // safety=true, home=false, update=true

    updatePermissions(c.id, { home_city: true });
    const perms = getPermissions(c.id);
    assert.ok(perms);
    assert.equal(perms!.safety_status, true);  // unchanged
    assert.equal(perms!.home_city, true);       // updated
    assert.equal(perms!.update_time, true);     // unchanged
  });

  it('updatePermissions with empty patch is a no-op', () => {
    const c = createContact(USER_A, USER_B);
    createDefaultPermissions(c.id);
    updatePermissions(c.id, {});
    const perms = getPermissions(c.id);
    assert.ok(perms);
    assert.equal(perms!.safety_status, true);
  });

  it('ON DELETE CASCADE: deleting a user removes their contacts', () => {
    const c = createContact(USER_A, USER_B);
    createDefaultPermissions(c.id);

    // Delete USER_A — should cascade to contacts where user_id = USER_A
    getDb().prepare('DELETE FROM users WHERE chat_id = ?').run(USER_A);

    assert.equal(getContactById(c.id), undefined);
    assert.equal(getPermissions(c.id), undefined);
  });

  it('ON DELETE CASCADE: removing contact removes its permissions', () => {
    const c = createContact(USER_A, USER_B);
    createDefaultPermissions(c.id);

    removeContact(c.id);
    assert.equal(getPermissions(c.id), undefined);
  });

  it('migration preserves existing data (re-init idempotency)', () => {
    const c = createContact(USER_A, USER_B);
    createDefaultPermissions(c.id, { safety_status: true, home_city: true });

    // Simulate restart: re-run initSchema on existing DB
    const { initSchema } = require('../db/schema');
    initSchema(getDb());

    // Data should survive
    const found = getContactById(c.id);
    assert.ok(found, 'contact should survive re-init');
    assert.equal(found!.user_id, USER_A);
    const perms = getPermissions(c.id);
    assert.ok(perms, 'permissions should survive re-init');
    assert.equal(perms!.home_city, true);
  });

  it('pruneExpiredContacts removes only expired pending requests', () => {
    const c1 = createContact(USER_A, USER_B); // pending, fresh
    const c2 = createContact(USER_A, USER_C); // pending, will be backdated
    acceptContact(c1.id); // now accepted — should survive prune

    // Backdate c2 to 8 days ago
    getDb()
      .prepare("UPDATE contacts SET created_at = datetime('now', '-8 days') WHERE id = ?")
      .run(c2.id);

    const pruned = pruneExpiredContacts();
    assert.equal(pruned, 1, 'should prune exactly 1 expired pending contact');

    // c1 (accepted) should survive
    assert.ok(getContactById(c1.id), 'accepted contact should survive');
    // c2 (old pending) should be gone
    assert.equal(getContactById(c2.id), undefined, 'expired pending contact should be removed');
  });

  it('representative permission lookup: create → set → read full cycle', () => {
    const c = createContact(USER_A, USER_B);
    createDefaultPermissions(c.id); // defaults: safety=true, home=false, update=true

    // Update one field
    updatePermissions(c.id, { home_city: true });

    // Verify full state
    const perms = getPermissions(c.id);
    assert.ok(perms);
    assert.equal(perms!.safety_status, true);
    assert.equal(perms!.home_city, true);
    assert.equal(perms!.update_time, true);

    // Decode booleans (not raw 0/1)
    assert.equal(typeof perms!.safety_status, 'boolean');
    assert.equal(typeof perms!.home_city, 'boolean');
  });

  it('createDefaultPermissions throws if insert fails (unknown contactRowId)', () => {
    // FK constraint: contact_id must reference contacts(id)
    // With FK enforcement, inserting a row with an unknown id should throw
    getDb().pragma('foreign_keys = ON');
    assert.throws(
      () => createDefaultPermissions(99999),
      /FOREIGN KEY|Failed to create permissions/,
      'should throw on FK violation or result.changes === 0'
    );
  });

  it('updatePermissions throws on unknown contactRowId', () => {
    assert.throws(
      () => updatePermissions(99999, { safety_status: false }),
      /not found/i,
      'should throw when no row exists'
    );
  });

  it('createContactWithPermissions creates both rows atomically', () => {
    upsertUser(5001);
    upsertUser(5002);
    const contact = createContactWithPermissions(5001, 5002, { safety_status: true, home_city: true });

    const perms = getPermissions(contact.id);
    assert.ok(perms, 'permissions row should exist');
    assert.equal(perms.safety_status, true);
    assert.equal(perms.home_city, true);
  });

  // T6: transaction rollback — no orphaned contact row on failure
  it('createContactWithPermissions rolls back contact row when creation fails (T6)', () => {
    // Enable FK enforcement so that a missing user causes the INSERT to fail
    getDb().pragma('foreign_keys = ON');
    upsertUser(6001);
    // 6002 is deliberately NOT inserted — FK on contacts(contact_id) → users(chat_id) will fail

    assert.throws(
      () => createContactWithPermissions(6001, 6002),
      /FOREIGN KEY|SQLITE_CONSTRAINT|not found/i
    );

    // The transaction must have rolled back — no orphaned row should exist
    const orphan = getContactByPair(6001, 6002);
    assert.equal(orphan, undefined, 'contact row must not exist after transaction rollback');

    // contact_permissions table must also be clean
    const permCount = getDb()
      .prepare('SELECT COUNT(*) as cnt FROM contact_permissions')
      .get() as { cnt: number };
    assert.equal(permCount.cnt, 0, 'no permissions row should exist after rollback');
  });
});
