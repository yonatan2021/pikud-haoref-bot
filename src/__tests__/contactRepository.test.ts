import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { initDb, getDb, closeDb } from '../db/schema';
import { upsertUser } from '../db/userRepository';
import {
  createContact,
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
});
