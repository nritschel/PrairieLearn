import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import * as sqldb from '@prairielearn/postgres';

import { config } from '../lib/config.js';
import { SubmissionSchema, VariantDraftSchema } from '../lib/db-types.js';
import { selectAssessmentByTid } from '../models/assessment.js';

import * as helperClient from './helperClient.js';
import * as helperServer from './helperServer.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

function draftBody({
  csrfToken,
  variantId,
  answer,
  action,
}: {
  csrfToken: string;
  variantId: string;
  answer?: string;
  action: 'save_draft' | 'restore_draft' | 'discard_draft' | 'save';
}) {
  return new URLSearchParams({
    __action: action,
    __csrf_token: csrfToken,
    __variant_id: variantId,
    ...(answer === undefined ? {} : { c: answer }),
  });
}

describe('Question draft autosave', { timeout: 60_000 }, function () {
  const siteUrl = `http://localhost:${config.serverPort}`;
  const baseUrl = `${siteUrl}/pl`;
  const courseInstanceBaseUrl = `${baseUrl}/course_instance/1`;

  const context: Record<string, any> = {};

  beforeAll(async function () {
    await helperServer.before()();
    const { id: assessmentId } = await selectAssessmentByTid({
      course_instance_id: '1',
      tid: 'hw1-automaticTestSuite',
    });
    context.assessmentUrl = `${courseInstanceBaseUrl}/assessment/${assessmentId}/`;
  });

  afterAll(helperServer.after);

  test('open the first question of a homework', async () => {
    const assessmentResponse = await helperClient.fetchCheerio(context.assessmentUrl);
    assert.isTrue(assessmentResponse.ok);

    const questionUrl = assessmentResponse.$('a:contains("Add two numbers")').first().attr('href');
    assert.isString(questionUrl);
    context.questionUrl = `${siteUrl}${questionUrl}`;

    const response = await helperClient.fetchCheerio(context.questionUrl);
    assert.isTrue(response.ok);
    helperClient.extractAndSaveCSRFToken(context, response.$, 'form.question-form');
    helperClient.extractAndSaveVariantId(context, response.$, 'form.question-form');
  });

  test('autosaving stores a draft without creating a submission', async () => {
    const response = await fetch(context.questionUrl, {
      method: 'POST',
      headers: { 'Content-type': 'application/x-www-form-urlencoded' },
      body: draftBody({
        csrfToken: context.__csrf_token,
        variantId: context.__variant_id,
        answer: '42',
        action: 'save_draft',
      }),
    });
    assert.equal(response.status, 204);

    const drafts = await sqldb.queryRows(sql.select_variant_drafts, VariantDraftSchema);
    assert.lengthOf(drafts, 1);
    assert.equal(drafts[0].variant_id, context.__variant_id);
    assert.deepEqual(drafts[0].raw_submitted_answer, { c: '42' });

    const submissions = await sqldb.queryRows(
      sql.select_submissions,
      { variant_id: context.__variant_id },
      SubmissionSchema,
    );
    assert.lengthOf(submissions, 0);
  });

  test('the question page offers to restore the draft and pauses autosaving', async () => {
    const response = await helperClient.fetchCheerio(context.questionUrl);
    assert.isTrue(response.ok);

    helperClient.assertAlert(response.$, 'You have unsaved work from');

    // While a draft is waiting to be restored, autosaving must stay off so a
    // fresh edit can't overwrite the work being offered.
    assert.lengthOf(response.$('form.question-form[data-autosave-draft]'), 0);
  });

  test('restoring the draft turns it into a submission', async () => {
    const response = await fetch(context.questionUrl, {
      method: 'POST',
      headers: { 'Content-type': 'application/x-www-form-urlencoded' },
      body: draftBody({
        csrfToken: context.__csrf_token,
        variantId: context.__variant_id,
        action: 'restore_draft',
      }),
    });
    assert.isTrue(response.ok);

    const submissions = await sqldb.queryRows(
      sql.select_submissions,
      { variant_id: context.__variant_id },
      SubmissionSchema,
    );
    assert.lengthOf(submissions, 1);
    assert.deepEqual(submissions[0].raw_submitted_answer, { c: '42' });
    // The draft held raw form data; saving it ran the question's `parse`, which
    // is what turns the string into the canonical answer.
    assert.deepEqual(submissions[0].submitted_answer, { c: 42 });

    assert.lengthOf(await sqldb.queryRows(sql.select_variant_drafts, VariantDraftSchema), 0);
  });

  test('the restored question page resumes autosaving', async () => {
    const response = await helperClient.fetchCheerio(context.questionUrl);
    assert.isTrue(response.ok);

    helperClient.assertAlert(response.$, 'You have unsaved work from', 0);
    assert.lengthOf(response.$('form.question-form[data-autosave-draft]'), 1);
  });

  test('saving an answer normally deletes the draft', async () => {
    const draftResponse = await fetch(context.questionUrl, {
      method: 'POST',
      headers: { 'Content-type': 'application/x-www-form-urlencoded' },
      body: draftBody({
        csrfToken: context.__csrf_token,
        variantId: context.__variant_id,
        answer: '7',
        action: 'save_draft',
      }),
    });
    assert.equal(draftResponse.status, 204);
    assert.lengthOf(await sqldb.queryRows(sql.select_variant_drafts, VariantDraftSchema), 1);

    const saveResponse = await fetch(context.questionUrl, {
      method: 'POST',
      headers: { 'Content-type': 'application/x-www-form-urlencoded' },
      body: draftBody({
        csrfToken: context.__csrf_token,
        variantId: context.__variant_id,
        answer: '9',
        action: 'save',
      }),
    });
    assert.isTrue(saveResponse.ok);

    assert.lengthOf(await sqldb.queryRows(sql.select_variant_drafts, VariantDraftSchema), 0);

    const submissions = await sqldb.queryRows(
      sql.select_submissions,
      { variant_id: context.__variant_id },
      SubmissionSchema,
    );
    assert.deepEqual(submissions[0].submitted_answer, { c: 9 });
  });

  test('a draft older than the latest submission is not offered', async () => {
    const response = await fetch(context.questionUrl, {
      method: 'POST',
      headers: { 'Content-type': 'application/x-www-form-urlencoded' },
      body: draftBody({
        csrfToken: context.__csrf_token,
        variantId: context.__variant_id,
        answer: '1',
        action: 'save_draft',
      }),
    });
    assert.equal(response.status, 204);

    await sqldb.execute(sql.make_draft_stale, { variant_id: context.__variant_id });

    const pageResponse = await helperClient.fetchCheerio(context.questionUrl);
    assert.isTrue(pageResponse.ok);
    helperClient.assertAlert(pageResponse.$, 'You have unsaved work from', 0);
  });

  test('discarding a draft removes it', async () => {
    const response = await fetch(context.questionUrl, {
      method: 'POST',
      headers: { 'Content-type': 'application/x-www-form-urlencoded' },
      body: draftBody({
        csrfToken: context.__csrf_token,
        variantId: context.__variant_id,
        action: 'discard_draft',
      }),
    });
    assert.isTrue(response.ok);

    assert.lengthOf(await sqldb.queryRows(sql.select_variant_drafts, VariantDraftSchema), 0);
  });
});
