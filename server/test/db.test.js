import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hasDatabaseName } from '../src/db.js';

test('spots whether a MongoDB link names a database', () => {
  assert.equal(hasDatabaseName('mongodb+srv://me:pw@cluster0.abcde.mongodb.net/trailcast?retryWrites=true'), true);
  assert.equal(hasDatabaseName('mongodb://localhost:27017/trailcast'), true);

  assert.equal(hasDatabaseName('mongodb+srv://me:pw@cluster0.abcde.mongodb.net/?retryWrites=true&w=majority'), false);
  assert.equal(hasDatabaseName('mongodb+srv://me:pw@cluster0.abcde.mongodb.net/'), false);
  assert.equal(hasDatabaseName('mongodb+srv://me:pw@cluster0.abcde.mongodb.net'), false);
  assert.equal(hasDatabaseName('mongodb://localhost:27017'), false);
});
