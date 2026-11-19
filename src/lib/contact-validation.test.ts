import test from 'node:test';
import assert from 'node:assert/strict';
import { validateContactForm, buildContactMailtoHref } from './contact-validation';
import { FOUNDER_PROFILE } from './founder';

test('validateContactForm flags missing required fields', () => {
  const errors = validateContactForm({
    name: '',
    email: 'invalid-email',
    company: ' ',
    subject: '',
    message: 'Too short',
  });

  assert.equal(Boolean(errors.name), true);
  assert.equal(Boolean(errors.email), true);
  assert.equal(Boolean(errors.company), true);
  assert.equal(Boolean(errors.subject), true);
  assert.equal(Boolean(errors.message), true);
});

test('validateContactForm returns empty object for valid input', () => {
  const errors = validateContactForm({
    name: 'Aditya Ahirwal',
    email: 'aditya@company.com',
    company: 'Zevkar AI',
    subject: 'Schedule a Meeting',
    message: 'We want to monitor our n8n and FastAPI production pipelines safely.',
  });

  assert.deepEqual(errors, {});
});

test('buildContactMailtoHref encodes recipient, subject, and body accurately', () => {
  const href = buildContactMailtoHref('aditya84azm@gmail.com', {
    name: 'Jane Doe',
    email: 'jane@acme.io',
    company: 'Acme Ops',
    subject: 'Business & Partnerships',
    message: 'Interested in agency workspace onboarding for 12 clients.',
  });

  assert.equal(href.startsWith('mailto:aditya84azm@gmail.com?'), true);
  assert.equal(href.includes('Zevkar+AI'), true);
  assert.equal(href.includes('Business'), true);
  assert.equal(href.includes('Acme'), true);
});

test('FOUNDER_PROFILE enforces authentic founder identity and concise story', () => {
  assert.equal(FOUNDER_PROFILE.name, 'Aditya Ahirwal');
  assert.equal(FOUNDER_PROFILE.designation, 'Founder, Zevkar AI');
  assert.equal(FOUNDER_PROFILE.photoPath, '/picofme.jpg');
  assert.equal('expertiseTags' in FOUNDER_PROFILE, false);

  const storyText = FOUNDER_PROFILE.introParagraphs.join(' ');
  const wordCount = storyText.trim().split(/\s+/).length;
  assert.equal(wordCount >= 100 && wordCount <= 180, true, `Expected 100-180 words, got ${wordCount}`);
  assert.equal(/AI Engineer|Software Developer|Full Stack Developer|ML Engineer/i.test(storyText + FOUNDER_PROFILE.designation), false);

  const socialIds = FOUNDER_PROFILE.socialLinks.map((s) => s.id);
  assert.deepEqual(socialIds, ['linkedin', 'github', 'twitter']);
});
