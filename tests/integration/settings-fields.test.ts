// R14, R36 and R38 from Settings: fields on items and on models are added, renamed, given
// choices, moved, removed and restored from the Fields tables, and every item page and profile
// follows at once, with no code change.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { findFieldByKey } from '#core/db/repositories/fields.js';
import { findItemByPath } from '#core/db/repositories/items.js';
import { REFERENCE_ROOT_ID } from '#core/db/repositories/roots.js';
import { listSettingsFields, setFieldValue } from '#core/fields/fields.js';
import { createModel } from '#core/models/models.js';

import { startSettingsApp } from '../support/settings-app.ts';

import type { Field, FieldEntity } from '#core/db/repositories/fields.js';
import type { SettingsApp } from '../support/settings-app.ts';

let settings: SettingsApp;

beforeEach(async () => {
  settings = await startSettingsApp(['Figure/figure_0001.jpg', 'Figure/figure_0002.jpg']);
}, 60_000);

afterEach(async () => {
  await settings.remove();
});

/** Adds a field from Settings and returns it. */
async function addField(entity: FieldEntity, label: string, type: string): Promise<Field> {
  const response = await settings.send('POST', '/api/fields', { entity, label, type });
  expect(response.statusCode, response.body).toBe(200);
  const { id } = response.json<{ id: number }>();
  return listSettingsFields(settings.db, entity).find((field) => field.id === id)!;
}

/** The labels of an entity's Settings rows, in order. */
function settingsLabels(entity: FieldEntity): string[] {
  return listSettingsFields(settings.db, entity).map((field) => field.label);
}

/** The id of the item at a path under the Reference folder. */
function itemIdAt(relPath: string): number {
  const item = findItemByPath(settings.db, REFERENCE_ROOT_ID, relPath);
  expect(item, relPath).toBeDefined();
  return item!.id;
}

/** A page's HTML, which the test expects to be there. */
async function pageHtml(url: string): Promise<string> {
  const page = await settings.get(url);
  expect(page.statusCode, url).toBe(200);
  return page.body;
}

describe('the Fields tables in Settings', () => {
  it('R14: a model field added, renamed and removed in Settings updates every profile', async () => {
    const elena = createModel(settings.db, 'Elena Varga');
    createModel(settings.db, 'Second Model');
    const agency = await addField('model', 'Agency', 'link');
    expect(await pageHtml('/models/second-model')).toContain('Agency');

    setFieldValue(
      settings.db,
      { entity: 'model', entityId: elena, key: 'agency' },
      'https://example.com',
    );
    const renamed = await settings.send('POST', `/api/fields/${String(agency.id)}/label`, {
      label: 'Agency link',
    });
    expect(renamed.statusCode).toBe(204);
    for (const slug of ['elena-varga', 'second-model']) {
      expect(await pageHtml(`/models/${slug}`)).toContain('Agency link');
    }
    expect(await pageHtml('/models/elena-varga')).toContain('example.com');

    const removed = await settings.send('DELETE', `/api/fields/${String(agency.id)}`);
    expect(removed.statusCode).toBe(204);
    for (const slug of ['elena-varga', 'second-model']) {
      expect(await pageHtml(`/models/${slug}`)).not.toContain('Agency link');
    }
  });

  it('R36: an item field is added, given choices and moved from Settings, and shows on every item page', async () => {
    const pose = await addField('item', 'Pose length', 'picklist');
    const choices = await settings.send('POST', `/api/fields/${String(pose.id)}/choices`, {
      choices: 'Short, Long ,, Both',
    });
    expect(choices.statusCode).toBe(204);
    expect(findFieldByKey(settings.db, 'item', 'pose_length')?.options).toEqual([
      'Short',
      'Long',
      'Both',
    ]);
    for (const relPath of ['Figure/figure_0001.jpg', 'Figure/figure_0002.jpg']) {
      expect(await pageHtml(`/item/${String(itemIdAt(relPath))}`)).toContain('Pose length');
    }

    expect(settingsLabels('item')).toEqual(['Notes', 'Source URL', 'Rating', 'Pose length']);
    const up = await settings.send('POST', `/api/fields/${String(pose.id)}/up`);
    expect(up.statusCode).toBe(204);
    expect(settingsLabels('item')).toEqual(['Notes', 'Source URL', 'Pose length', 'Rating']);
    await settings.send('POST', `/api/fields/${String(pose.id)}/down`);
    await settings.send('POST', `/api/fields/${String(pose.id)}/down`);
    expect(settingsLabels('item')).toEqual(['Notes', 'Source URL', 'Rating', 'Pose length']);

    const page = await pageHtml('/settings');
    expect(page).toContain('pick-list: Short, Long, Both');
    expect(page).toContain('aria-label="Move Pose length up"');
    expect(page).not.toContain('aria-label="Move Pose length down"');
    const fieldsPanel = page.slice(page.indexOf('id="fields"'), page.indexOf('id="subcategories"'));
    expect(fieldsPanel).not.toContain('disabled');
  });

  it('R36: a model’s Name stays first, and Bio cannot move above it', async () => {
    const bio = findFieldByKey(settings.db, 'model', 'bio')!;
    await settings.send('POST', `/api/fields/${String(bio.id)}/up`);
    expect(settingsLabels('model')).toEqual(['Name', 'Bio']);
    const name = findFieldByKey(settings.db, 'model', 'name')!;
    const removed = await settings.send('DELETE', `/api/fields/${String(name.id)}`);
    expect(removed.statusCode).toBe(400);
    expect(removed.body).toContain('can be renamed but not removed');
    const page = await pageHtml('/settings');
    expect(page).not.toContain('aria-label="Move Bio up"');
    expect(page).not.toContain('aria-label="Remove Name"');
  });

  it('R38: a field restored within 30 days shows its old values on every item or model', async () => {
    const figure1 = itemIdAt('Figure/figure_0001.jpg');
    const elena = createModel(settings.db, 'Elena Varga');
    const notes = findFieldByKey(settings.db, 'item', 'notes')!;
    const sessions = await addField('model', 'Sessions', 'number');
    setFieldValue(
      settings.db,
      { entity: 'item', entityId: figure1, key: 'notes' },
      'warm rim light',
    );
    setFieldValue(settings.db, { entity: 'model', entityId: elena, key: 'sessions' }, 6);

    for (const field of [notes, sessions]) {
      expect((await settings.send('DELETE', `/api/fields/${String(field.id)}`)).statusCode).toBe(
        204,
      );
    }
    expect(await pageHtml(`/item/${String(figure1)}`)).not.toContain('warm rim light');
    expect(await pageHtml('/models/elena-varga')).not.toContain('Sessions');
    const settingsPage = await pageHtml('/settings');
    expect(settingsPage).toContain('Removed: Notes, restorable until');
    expect(settingsPage).toContain('aria-label="Restore Sessions"');

    const again = await settings.send('POST', '/api/fields', {
      entity: 'model',
      label: 'Sessions',
      type: 'number',
    });
    expect(again.statusCode).toBe(400);
    expect(again.body).toContain('can still be restored');

    for (const field of [notes, sessions]) {
      const restored = await settings.send('POST', `/api/fields/${String(field.id)}/restore`);
      expect(restored.statusCode).toBe(204);
    }
    expect(await pageHtml(`/item/${String(figure1)}`)).toContain('warm rim light');
    expect(await pageHtml('/models/elena-varga')).toMatch(/Sessions[\s\S]*6/);
    expect(await pageHtml('/settings')).not.toContain('Removed:');
  });

  it('R38: a field removed more than 30 days ago is not offered for restoring', async () => {
    const sessions = await addField('model', 'Sessions', 'number');
    settings.db
      .prepare('UPDATE fields SET removed_at = ? WHERE id = ?')
      .run(new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString(), sessions.id);
    expect(await pageHtml('/settings')).not.toContain('Restore Sessions');
    const restored = await settings.send('POST', `/api/fields/${String(sessions.id)}/restore`);
    expect(restored.statusCode).toBe(400);
    expect(restored.body).toContain('more than 30 days ago');
  });

  it('refuses a blank or reserved name, an unknown type, and a field that is not there', async () => {
    const blank = await settings.send('POST', '/api/fields', {
      entity: 'item',
      label: ' ',
      type: 'text',
    });
    expect(blank.statusCode).toBe(400);
    const reserved = await settings.send('POST', '/api/fields', {
      entity: 'item',
      label: 'Tag',
      type: 'text',
    });
    expect(reserved.statusCode).toBe(400);
    const badType = await settings.send('POST', '/api/fields', {
      entity: 'item',
      label: 'Mood',
      type: 'colour',
    });
    expect(badType.statusCode).toBe(400);
    for (const [method, url] of [
      ['DELETE', '/api/fields/9999'],
      ['POST', '/api/fields/9999/restore'],
      ['POST', '/api/fields/9999/up'],
    ] as const) {
      expect((await settings.send(method, url)).statusCode, url).toBe(404);
    }
    const rating = findFieldByKey(settings.db, 'item', 'rating')!;
    const choices = await settings.send('POST', `/api/fields/${String(rating.id)}/choices`, {
      choices: 'a, b',
    });
    expect(choices.statusCode).toBe(400);
  });
});
