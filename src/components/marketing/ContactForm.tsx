import React, { useState, useEffect, useRef } from 'react';
import { AlertCircle, Calendar, CheckCircle2, Mail, Send } from 'lucide-react';
import {
  buildContactMailtoHref,
  CONTACT_SUBJECT_OPTIONS,
  ContactFormErrors,
  ContactFormInput,
  validateContactForm,
} from '../../lib/contact-validation';
import { FOUNDER_PROFILE } from '../../lib/founder';

interface ContactFormProps {
  selectedSubject?: string;
  focusTrigger?: number;
}

export const ContactForm: React.FC<ContactFormProps> = ({
  selectedSubject,
  focusTrigger,
}) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [subject, setSubject] = useState<string>(
    selectedSubject || CONTACT_SUBJECT_OPTIONS[0]
  );
  const [message, setMessage] = useState('');
  const [website, setWebsite] = useState(''); // Honeypot anti-spam field
  const [errors, setErrors] = useState<ContactFormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [meetingNotice, setMeetingNotice] = useState(false);
  const [submittedRecord, setSubmittedRecord] = useState<{
    payload: ContactFormInput;
    submissionId: string;
    message: string;
  } | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (selectedSubject) {
      setSubject(selectedSubject);
      if (selectedSubject === 'Schedule a Technical Walkthrough') {
        setMeetingNotice(true);
      }
    }
  }, [selectedSubject]);

  useEffect(() => {
    if (focusTrigger && focusTrigger > 0) {
      nameInputRef.current?.focus();
    }
  }, [focusTrigger]);

  const handleScheduleMeetingClick = () => {
    setSubmittedRecord(null);
    setServerError(null);
    setSubject('Schedule a Technical Walkthrough');
    setMeetingNotice(true);
    if (!message.trim()) {
      setMessage(
        'I would like to schedule a technical walkthrough of Zevkar AI workflow monitoring, failure diagnosis, and recovery approvals.'
      );
    }
    nameInputRef.current?.focus();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);
    const payload: ContactFormInput = {
      name,
      email,
      company,
      subject,
      message,
      website,
    };
    const validationErrors = validateContactForm(payload);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/v1/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setServerError(data.error || data.detail || 'Submission could not be completed.');
        return;
      }

      setSubmittedRecord({
        payload: {
          name: name.trim(),
          email: email.trim(),
          company: company.trim(),
          subject: subject.trim(),
          message: message.trim(),
        },
        submissionId: data.submissionId || data.submission_id || 'cnt_logged',
        message:
          data.message ||
          'Your inquiry passed server validation and was recorded.',
      });
    } catch {
      setServerError('Network error communicating with contact endpoint. Please use direct email below.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submittedRecord) {
    const mailtoHref = buildContactMailtoHref(FOUNDER_PROFILE.email, submittedRecord.payload);

    return (
      <div className="rounded-2xl border border-[#363125] bg-[#171A1B] p-6 sm:p-8 space-y-6">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 text-[#8CC59B] shrink-0 mt-0.5" aria-hidden="true" />
          <div className="space-y-2">
            <h2 className="font-[var(--font-display)] text-xl font-bold text-[#F0E9D9]">
              Inquiry Received ({submittedRecord.submissionId})
            </h2>
            <p className="text-sm leading-relaxed text-[#B8AE9B]">
              {submittedRecord.message}
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-[#363125] bg-[#211D10] p-4 space-y-2 text-xs text-[#B8AE9B]">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-[#F0E9D9]">Subject</span>
            <span>{submittedRecord.payload.subject}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-[#F0E9D9]">Company</span>
            <span>{submittedRecord.payload.company}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-[#F0E9D9]">Direct Contact</span>
            <span className="font-mono text-[#F0E9D9]">{FOUNDER_PROFILE.email}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <a
            href={mailtoHref}
            className="inline-flex items-center gap-2 rounded-md bg-[#A51D0B] hover:bg-[#C52A18] px-5 py-2.5 text-sm font-semibold text-[#F0E9D9] transition-colors whitespace-nowrap"
          >
            <Mail className="h-4 w-4" aria-hidden="true" />
            <span>Open Copy in Email Client</span>
          </a>
          <button
            type="button"
            onClick={() => {
              setSubmittedRecord(null);
              setMeetingNotice(false);
              setName('');
              setEmail('');
              setCompany('');
              setMessage('');
            }}
            className="rounded-md border border-[#363125] bg-[#211D10] hover:border-[#B8AE9B] px-4 py-2.5 text-xs font-semibold text-[#F0E9D9] transition-colors whitespace-nowrap"
          >
            Send Another Inquiry
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      id="contact-inquiry-form"
      onSubmit={handleSubmit}
      noValidate
      className="rounded-2xl border border-[#363125] bg-[#171A1B] p-6 sm:p-8 space-y-5"
    >
      <div className="space-y-2 border-b border-[#363125] pb-5">
        <h2 className="font-[var(--font-display)] text-2xl sm:text-3xl font-bold tracking-tight text-[#F0E9D9]">
          Connect with Zevkar AI
        </h2>
        <p className="text-sm leading-relaxed text-[#B8AE9B]">
          Have a question about n8n monitoring, custom webhook reporting, or workspace onboarding? Send us a note below.
        </p>

        <div className="pt-2 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleScheduleMeetingClick}
            className="inline-flex items-center gap-2 rounded-md border border-[#363125] bg-[#211D10] hover:border-[#A51D0B] px-3.5 py-2 text-xs font-semibold text-[#F0E9D9] transition-colors whitespace-nowrap"
          >
            <Calendar className="h-3.5 w-3.5 text-[#C52A18]" aria-hidden="true" />
            <span>Schedule a Technical Walkthrough</span>
          </button>

          <a
            href={`mailto:${FOUNDER_PROFILE.email}?subject=${encodeURIComponent('Direct Inquiry — Zevkar AI')}`}
            className="inline-flex items-center gap-2 rounded-md border border-[#363125] bg-[#211D10] hover:border-[#B8AE9B] px-3.5 py-2 text-xs font-semibold text-[#B8AE9B] hover:text-[#F0E9D9] transition-colors whitespace-nowrap"
          >
            <Mail className="h-3.5 w-3.5 text-[#C52A18]" aria-hidden="true" />
            <span>Direct Email ({FOUNDER_PROFILE.email})</span>
          </a>
        </div>
      </div>

      {/* Honeypot input kept visually hidden for spam mitigation */}
      <div className="sr-only" aria-hidden="true">
        <label htmlFor="contact-website">Leave blank</label>
        <input
          id="contact-website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>

      {meetingNotice && (
        <div className="rounded-lg border border-[#544021] bg-[#211D10] px-4 py-3 flex items-start gap-2.5 text-xs text-[#F0E9D9]">
          <Calendar className="h-4 w-4 text-[#E2B066] shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            Walkthrough topic selected. Include your preferred dates, timezone, and automation platforms below.
          </span>
        </div>
      )}

      {serverError && (
        <div role="alert" className="rounded-lg border border-[#61231C] bg-[#2B1513] px-4 py-3 text-xs text-[#E88A7E]">
          {serverError}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="contact-name" className="block text-xs font-semibold text-[#F0E9D9] mb-1.5">
            Full Name
          </label>
          <input
            ref={nameInputRef}
            id="contact-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Alex Rivera"
            className="w-full rounded-md border border-[#363125] bg-[#211D10] px-3.5 py-2.5 text-sm text-[#F0E9D9] placeholder:text-[#B8AE9B]/50 focus:border-[#A51D0B] focus:outline-none"
          />
          {errors.name && (
            <p role="alert" className="mt-1 text-xs text-[#E88A7E]">
              {errors.name}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="contact-email" className="block text-xs font-semibold text-[#F0E9D9] mb-1.5">
            Work Email
          </label>
          <input
            id="contact-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="alex@company.com"
            className="w-full rounded-md border border-[#363125] bg-[#211D10] px-3.5 py-2.5 text-sm text-[#F0E9D9] placeholder:text-[#B8AE9B]/50 focus:border-[#A51D0B] focus:outline-none"
          />
          {errors.email && (
            <p role="alert" className="mt-1 text-xs text-[#E88A7E]">
              {errors.email}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
        <div className="sm:col-span-5">
          <label htmlFor="contact-company" className="block text-xs font-semibold text-[#F0E9D9] mb-1.5">
            Company
          </label>
          <input
            id="contact-company"
            type="text"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="Northstar Operations"
            className="w-full rounded-md border border-[#363125] bg-[#211D10] px-3.5 py-2.5 text-sm text-[#F0E9D9] placeholder:text-[#B8AE9B]/50 focus:border-[#A51D0B] focus:outline-none"
          />
          {errors.company && (
            <p role="alert" className="mt-1 text-xs text-[#E88A7E]">
              {errors.company}
            </p>
          )}
        </div>

        <div className="sm:col-span-7">
          <label htmlFor="contact-subject" className="block text-xs font-semibold text-[#F0E9D9] mb-1.5">
            Subject
          </label>
          <select
            id="contact-subject"
            value={subject}
            onChange={(e) => {
              setSubject(e.target.value);
              setMeetingNotice(e.target.value === 'Schedule a Technical Walkthrough');
            }}
            className="w-full rounded-md border border-[#363125] bg-[#211D10] px-3.5 pr-8 py-2.5 text-sm text-[#F0E9D9] focus:border-[#A51D0B] focus:outline-none"
          >
            {CONTACT_SUBJECT_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          {errors.subject && (
            <p role="alert" className="mt-1 text-xs text-[#E88A7E]">
              {errors.subject}
            </p>
          )}
        </div>
      </div>

      <div>
        <label htmlFor="contact-message" className="block text-xs font-semibold text-[#F0E9D9] mb-1.5">
          Message
        </label>
        <textarea
          id="contact-message"
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Tell us about your workflows (n8n, Python/FastAPI, custom webhooks), failure patterns, or onboarding questions..."
          className="w-full rounded-md border border-[#363125] bg-[#211D10] px-3.5 py-2.5 text-sm text-[#F0E9D9] placeholder:text-[#B8AE9B]/50 focus:border-[#A51D0B] focus:outline-none"
        />
        {errors.message && (
          <p role="alert" className="mt-1 text-xs text-[#E88A7E]">
            {errors.message}
          </p>
        )}
      </div>

      <div className="rounded-lg border border-[#363125] bg-[#211D10] p-3 flex items-start gap-2.5 text-xs text-[#B8AE9B]">
        <AlertCircle className="h-4 w-4 text-[#E2B066] shrink-0 mt-0.5" aria-hidden="true" />
        <span>
          Submissions are validated server-side via POST /api/v1/contact with spam protection and rate limiting.
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex items-center gap-2 rounded-md bg-[#A51D0B] hover:bg-[#C52A18] disabled:opacity-60 px-6 py-2.5 text-sm font-semibold text-[#F0E9D9] transition-colors whitespace-nowrap"
        >
          <Send className="h-4 w-4" aria-hidden="true" />
          <span>{isSubmitting ? 'Submitting...' : 'Submit Inquiry'}</span>
        </button>

        <span className="text-xs text-[#B8AE9B]">
          Direct email:{' '}
          <a
            href={`mailto:${FOUNDER_PROFILE.email}`}
            className="text-[#F0E9D9] underline decoration-[#363125] hover:text-[#C52A18]"
          >
            {FOUNDER_PROFILE.email}
          </a>
        </span>
      </div>
    </form>
  );
};
