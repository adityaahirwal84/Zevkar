export interface ContactFormInput {
  name: string;
  email: string;
  company: string;
  subject: string;
  message: string;
  website?: string;
}

export interface ContactFormErrors {
  name?: string;
  email?: string;
  company?: string;
  subject?: string;
  message?: string;
}

export const CONTACT_SUBJECT_OPTIONS = [
  'Building with Zevkar AI',
  'Schedule a Technical Walkthrough',
  'Multi-Client Agency Onboarding',
  'General Questions',
] as const;

export function validateContactForm(input: ContactFormInput): ContactFormErrors {
  const errors: ContactFormErrors = {};
  if (!input.name.trim()) {
    errors.name = 'Full name is required.';
  }
  if (!input.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) {
    errors.email = 'Enter a valid work email address.';
  }
  if (!input.company.trim()) {
    errors.company = 'Company or organization name is required.';
  }
  if (!input.subject.trim()) {
    errors.subject = 'Please select or enter a subject.';
  }
  if (input.message.trim().length < 15) {
    errors.message = 'Please enter at least 15 characters describing your question or automation challenge.';
  }
  return errors;
}

export function buildContactMailtoHref(recipientEmail: string, payload: ContactFormInput): string {
  const subjectText = `[Zevkar AI] ${payload.subject.trim()} — ${payload.company.trim()}`;
  const bodyLines = [
    `Full Name: ${payload.name.trim()}`,
    `Work Email: ${payload.email.trim()}`,
    `Company: ${payload.company.trim()}`,
    `Topic: ${payload.subject.trim()}`,
    '',
    payload.message.trim(),
  ];
  const params = new URLSearchParams({
    subject: subjectText,
    body: bodyLines.join('\n'),
  });
  return `mailto:${recipientEmail}?${params.toString()}`;
}
