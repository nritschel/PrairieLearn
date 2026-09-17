import type { CheerioAPI } from 'cheerio';
import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import * as sqldb from '@prairielearn/postgres';

import { type UnsavedWorkData } from '../lib/client/unsaved-work.js';
import { config } from '../lib/config.js';
import { SubmissionDraftSchema, SubmissionSchema } from '../lib/db-types.js';
import { selectAssessmentByTid } from '../models/assessment.js';

import * as helperClient from './helperClient.js';
import * as helperServer from './helperServer.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

function extractUnsavedWorkData($: CheerioAPI): UnsavedWorkData {
  return JSON.parse(Buffer.from($('#unsaved-work-data').text(), 'base64').toString());
}

describe('Unsaved work recovery', { timeout: 60_000, concurrent: false }, function () {
  const context: Record<string, any> = { siteUrl: `http://localhost:${config.serverPort}` };
  context.baseUrl = `${context.siteUrl}/pl`;
  context.courseInstanceBaseUrl = `${context.baseUrl}/course_instance/1`;

  beforeAll(async function () {
    await helperServer.before()();
    const { id: assessmentId } = await selectAssessmentByTid({
      course_instance_id: '1',
      tid: 'hw1-automaticTestSuite',
    });
    context.assessmentUrl = `${context.courseInstanceBaseUrl}/assessment/${assessmentId}/`;
  });

  afterAll(helperServer.after);

  function selectDrafts() {
    return sqldb.queryRows(
      sql.select_drafts_for_variant,
      { variant_id: context.__variant_id },
      SubmissionDraftSchema,
    );
  }

  function selectSubmissions() {
    return sqldb.queryRows(
      sql.select_submissions_for_variant,
      { variant_id: context.__variant_id },
      SubmissionSchema,
    );
  }

  function snapshotUnsavedWork(answer: string) {
    return fetch(context.unsavedWorkUrl, {
      method: 'POST',
      body: new URLSearchParams({
        __csrf_token: context.unsavedWorkCsrfToken,
        __variant_id: context.__variant_id,
        c: answer,
      }),
    });
  }

  test('visit the homework and open a question', async () => {
    const assessmentResponse = await helperClient.fetchCheerio(context.assessmentUrl);
    assert.isTrue(assessmentResponse.ok);

    const questionPath = assessmentResponse.$('a:contains("Add two numbers")').attr('href');
    context.questionUrl = `${context.siteUrl}${questionPath}`;

    const instanceQuestionId = /instance_question\/(\d+)/.exec(questionPath ?? '')?.[1];
    context.unsavedWorkUrl = `${context.courseInstanceBaseUrl}/instance_question/${instanceQuestionId}/unsaved_work`;

    const response = await helperClient.fetchCheerio(context.questionUrl);
    assert.isTrue(response.ok);

    helperClient.extractAndSaveCSRFToken(context, response.$, '.question-form');
    helperClient.extractAndSaveVariantId(context, response.$, '.question-form');

    const unsavedWorkData = extractUnsavedWorkData(response.$);
    assert.equal(unsavedWorkData.url, context.unsavedWorkUrl.replace(context.siteUrl, ''));
    context.unsavedWorkCsrfToken = unsavedWorkData.csrfToken;
  });

  test('snapshot unsaved work', async () => {
    const response = await snapshotUnsavedWork('42');
    assert.equal(response.status, 204);

    const drafts = await selectDrafts();
    assert.lengthOf(drafts, 1);
    assert.equal(drafts[0].submitted_answer.c, '42');
    assert.isNull(drafts[0].dismissed_at);

    // Snapshots must never become submissions on their own.
    assert.isEmpty(await selectSubmissions());
  });

  test('later snapshots replace the previous one', async () => {
    const response = await snapshotUnsavedWork('43');
    assert.equal(response.status, 204);

    const drafts = await selectDrafts();
    assert.lengthOf(drafts, 1);
    assert.equal(drafts[0].submitted_answer.c, '43');
  });

  test('question page offers the unsaved work and pauses capture', async () => {
    const response = await helperClient.fetchCheerio(context.questionUrl);
    assert.isTrue(response.ok);

    assert.lengthOf(response.$('button:contains("Restore unsaved work")'), 1);
    assert.lengthOf(response.$('#unsaved-work-data'), 0);
  });

  test('dismissing keeps the last saved answer and resumes capture', async () => {
    const dismissResponse = await fetch(`${context.unsavedWorkUrl}/dismiss`, {
      method: 'POST',
      body: new URLSearchParams({
        __csrf_token: context.unsavedWorkCsrfToken,
        __variant_id: context.__variant_id,
      }),
    });
    assert.isTrue(dismissResponse.ok);

    const drafts = await selectDrafts();
    assert.lengthOf(drafts, 1);
    assert.isNotNull(drafts[0].dismissed_at);

    const response = await helperClient.fetchCheerio(context.questionUrl);
    assert.lengthOf(response.$('button:contains("Restore unsaved work")'), 0);
    assert.lengthOf(response.$('#unsaved-work-data'), 1);
  });

  test('a new snapshot is offered again after a dismissal', async () => {
    await snapshotUnsavedWork('44');

    const drafts = await selectDrafts();
    assert.isNull(drafts[0].dismissed_at);

    const response = await helperClient.fetchCheerio(context.questionUrl);
    assert.lengthOf(response.$('button:contains("Restore unsaved work")'), 1);
  });

  test('restoring saves the unsaved work without grading it', async () => {
    const response = await fetch(`${context.unsavedWorkUrl}/restore`, {
      method: 'POST',
      body: new URLSearchParams({
        __csrf_token: context.unsavedWorkCsrfToken,
        __variant_id: context.__variant_id,
      }),
    });
    assert.isTrue(response.ok);

    const submissions = await selectSubmissions();
    assert.lengthOf(submissions, 1);
    assert.equal(submissions[0].submitted_answer?.c, 44);
    assert.equal(submissions[0].raw_submitted_answer?.c, '44');
    assert.isNull(submissions[0].score);
    assert.isNull(submissions[0].graded_at);

    assert.isEmpty(await selectDrafts());
  });

  test('saving normally discards any unsaved work', async () => {
    await snapshotUnsavedWork('45');
    assert.lengthOf(await selectDrafts(), 1);

    const response = await fetch(context.questionUrl, {
      method: 'POST',
      body: new URLSearchParams({
        __action: 'save',
        __csrf_token: context.__csrf_token,
        __variant_id: context.__variant_id,
        c: '7',
      }),
    });
    assert.isTrue(response.ok);

    assert.isEmpty(await selectDrafts());

    const submissions = await selectSubmissions();
    assert.lengthOf(submissions, 2);
    assert.equal(submissions[0].submitted_answer?.c, 7);
  });
});
