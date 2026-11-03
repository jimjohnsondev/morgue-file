// Making a model profile: a row with a unique URL slug, titled by its Name field (R14).
import { insertModel, isModelSlugTaken } from '#core/db/repositories/models.js';
import { AppError } from '#core/errors.js';
import { setFieldValue } from '#core/fields/fields.js';
import { slugify } from '#core/slug.js';

import type { Db } from '#core/db/connection.js';

/** Adds a model with a name and returns its id. Two models with one name get distinct slugs. */
export function createModel(db: Db, name: string): number {
  const baseSlug = slugify(name);
  if (baseSlug === '') {
    throw new AppError('invalid-input', 'A model needs a name with at least one letter or digit.');
  }
  return db.transaction(() => {
    let slug = baseSlug;
    for (let copy = 2; isModelSlugTaken(db, slug); copy++) {
      slug = `${baseSlug}-${String(copy)}`;
    }
    const modelId = insertModel(db, slug);
    setFieldValue(db, { entity: 'model', entityId: modelId, key: 'name' }, name.trim());
    return modelId;
  })();
}
