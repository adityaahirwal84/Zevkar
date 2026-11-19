'use client';

import React, { useState, useRef } from 'react';
import Link from 'next/link';
import {
  Activity,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Github,
  Handshake,
  HelpCircle,
  Linkedin,
  Mail,
  Send,
} from 'lucide-react';
import { NextMarketingShell } from '@/components/NextMarketingShell';
import { api } from '@/lib/api-client';
import { FOUNDER_STORY } from '@/lib/site-content';

const SUBJECT_OPTIONS = [
  'Building with Zevkar AI',
  'Schedule a Meeting',
  'Business & Partnerships',
  'General Questions',
];

export default function ContactPage() {
  const [photoFailed, setPhotoFailed] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [subject, setSubject] = useState(SUBJECT_OPTIONS[0]);
  const [message, setMessage] = useState('');
  const [website, setWebsite] = useState(''); // honeypot
  const [meetingNotice, setMeetingNotice] = useState(false);
  const [socialNotice, setSocialNotice] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ submissionId: string; receivedAt: string } | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const handleSelectTopic = (nextSubject: string) => {
    setReceipt(null);
    setSubmitError(null);
    setSubject(nextSubject);
    setMeetingNotice(nextSubject === 'Schedule a Meeting');
    nameRef.current?.focus();
    const formEl = document.getElementById('next-contact-form');
    if (formEl) formEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    const nextErrors: Record<string, string> = {};
    if (!name.trim()) nextErrors.name = 'Full name is required.';
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      nextErrors.email = 'Enter a valid work email address.';
    }
    if (!company.trim()) nextErrors.company = 'Company name is required.';
    if (message.trim().length < 15) {
      nextErrors.message = 'Please enter at least 15 characters describing your challenge or question.';
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      const res = await api.contact.submit({
        name: name.trim(),
        email: email.trim(),
        company: company.trim(),
        subject,
        message: message.trim(),
        website,
      });
      setReceipt({
        submissionId: res.submissionId || res.submission_id || 'INQ-RECORDED',
        receivedAt: res.received_at || new Date().toISOString(),
      });
    } catch (err: any) {
      setSubmitError(err?.message || 'Unable to submit message. Please email directly.');
    } finally {
      setSubmitting(false);
    }
  };

  const mailtoHref = `mailto:${FOUNDER_STORY.email}?${new URLSearchParams({
    subject: `[Zevkar AI] ${subject} — ${company.trim()}`,
    body: `Full Name: ${name.trim()}\nWork Email: ${email.trim()}\nCompany: ${company.trim()}\nTopic: ${subject}\n\n${message.trim()}`,
  }).toString()}`;

  return (
    <NextMarketingShell activePath="/contact">
      <section className="border-b border-[#363125] bg-[#211D10] py-14 md:py-20">
        <div className="mx-auto max-w-[1320px] px-6 space-y-12">
          <div className="max-w-2xl space-y-3">
            <div className="text-xs font-semibold tracking-wide text-[#C52A18]">Contact</div>
            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-[#F0E9D9] leading-[1.08]">
              Talk directly with the founder.
            </h1>
            <p className="text-base sm:text-lg text-[#B8AE9B] leading-relaxed">
              Whether you are dealing with fragile workflows, exploring a deployment for your team, or sharing feedback—I&apos;d love to hear from you.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-start">
            <article className="lg:col-span-6 lg:pr-6 space-y-8">
              <div className="flex flex-col sm:flex-row sm:items-center gap-5">
                <div className="h-24 w-24 sm:h-28 sm:w-28 shrink-0 rounded-full border-2 border-[#A51D0B]/70 bg-[#211D10] p-1">
                  <div className="h-full w-full rounded-full overflow-hidden bg-[#171A1B] flex items-center justify-center">
                    {!photoFailed ? (
                      <img
                        src="/picofme.jpg"
                        alt="Aditya Ahirwal — Founder, Zevkar AI"
                        referrerPolicy="no-referrer"
                        onError={() => setPhotoFailed(true)}
                        className="h-full w-full object-cover scale-[1.06]"
                      />
                    ) : (
                      <span className="text-2xl font-bold text-[#F0E9D9]">AA</span>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#F0E9D9]">
                    {FOUNDER_STORY.name}
                  </h2>
                  <p className="text-sm font-medium text-[#C52A18]">{FOUNDER_STORY.designation}</p>
                  <a
                    href={`mailto:${FOUNDER_STORY.email}`}
                    className="inline-flex items-center gap-1.5 text-xs text-[#B8AE9B] hover:text-[#F0E9D9] pt-1"
                  >
                    <Mail className="h-3.5 w-3.5 text-[#B8AE9B]" aria-hidden="true" />
                    <span>{FOUNDER_STORY.email}</span>
                  </a>
                </div>
              </div>

              <div className="space-y-5 border-t border-[#363125] pt-7 text-[15px] sm:text-base leading-[1.75] text-[#B8AE9B] max-w-xl">
                {FOUNDER_STORY.paragraphs.map((p, idx) => (
                  <p key={idx} className={idx === 0 ? 'text-[#F0E9D9] font-medium' : ''}>
                    {p}
                  </p>
                ))}
              </div>

              <div className="border-t border-[#363125] pt-6 space-y-3">
                <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                  {[
                    { id: 'LinkedIn', Icon: Linkedin },
                    { id: 'GitHub', Icon: Github },
                    { id: 'X / Twitter', Icon: null },
                  ].map(({ id, Icon }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() =>
                        setSocialNotice((prev) =>
                          prev?.includes(id)
                            ? null
                            : `${id} profile link is awaiting configuration — reach out directly via ${FOUNDER_STORY.email}.`
                        )
                      }
                      className="inline-flex items-center gap-2 text-sm font-medium text-[#B8AE9B] hover:text-[#F0E9D9] transition-colors whitespace-nowrap"
                    >
                      {Icon ? (
                        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      ) : (
                        <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5 shrink-0" aria-hidden="true">
                          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                        </svg>
                      )}
                      <span>{id}</span>
                    </button>
                  ))}
                </div>
                {socialNotice && <p className="text-xs text-[#B8AE9B] leading-relaxed">{socialNotice}</p>}
              </div>
            </article>

            <div className="lg:col-span-6">
              {receipt ? (
                <div className="rounded-2xl border border-[#363125] bg-[#171A1B] p-6 sm:p-8 space-y-6">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-[#8CC59B] shrink-0 mt-0.5" />
                    <div className="space-y-2">
                      <h2 className="text-xl font-bold text-[#F0E9D9]">Inquiry Recorded</h2>
                      <p className="text-sm text-[#B8AE9B]">
                        Reference <span className="font-mono text-[#F0E9D9]">{receipt.submissionId}</span> was validated and logged for {email}. You can also launch your mail client below to send a copy directly.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <a
                      href={mailtoHref}
                      className="inline-flex items-center gap-2 rounded-md bg-[#A51D0B] hover:bg-[#C52A18] px-5 py-2.5 text-sm font-semibold text-[#F0E9D9]"
                    >
                      <Mail className="h-4 w-4" />
                      <span>Open Email Copy</span>
                    </a>
                    <button
                      type="button"
                      onClick={() => setReceipt(null)}
                      className="rounded-md border border-[#363125] bg-[#211D10] px-4 py-2.5 text-xs font-semibold text-[#F0E9D9]"
                    >
                      Send Another Message
                    </button>
                  </div>
                </div>
              ) : (
                <form
                  id="next-contact-form"
                  onSubmit={handleSubmit}
                  noValidate
                  className="rounded-2xl border border-[#363125] bg-[#171A1B] p-6 sm:p-8 space-y-5"
                >
                  <div className="space-y-2 border-b border-[#363125] pb-5">
                    <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#F0E9D9]">
                      Let&apos;s Build Something Reliable
                    </h2>
                    <p className="text-sm text-[#B8AE9B]">
                      Have a question, deployment plan, or automation challenge? Share the details below.
                    </p>
                    <div className="pt-2 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => handleSelectTopic('Schedule a Meeting')}
                        className="inline-flex items-center gap-2 rounded-md border border-[#363125] bg-[#202326] hover:border-[#A51D0B] px-3.5 py-2 text-xs font-semibold text-[#F0E9D9]"
                      >
                        <Calendar className="h-3.5 w-3.5 text-[#C52A18]" />
                        <span>Schedule a Meeting</span>
                      </button>
                      <a
                        href={`mailto:${FOUNDER_STORY.email}`}
                        className="inline-flex items-center gap-2 rounded-md border border-[#363125] bg-[#202326] px-3.5 py-2 text-xs font-semibold text-[#B8AE9B] hover:text-[#F0E9D9]"
                      >
                        <Mail className="h-3.5 w-3.5 text-[#C52A18]" />
                        <span>{FOUNDER_STORY.email}</span>
                      </a>
                    </div>
                  </div>

                  {meetingNotice && (
                    <div className="rounded-lg border border-[#544021] bg-[#211D10] px-4 py-3 text-xs text-[#F0E9D9]">
                      Meeting topic selected. Include your preferred dates, timezone, and workflow stack below.
                    </div>
                  )}

                  {submitError && (
                    <div role="alert" className="rounded-lg border border-[#61231C] bg-[#2B1513] px-4 py-3 text-xs text-[#E88A7E]">
                      {submitError}
                    </div>
                  )}

                  {/* Honeypot anti-spam field */}
                  <div className="hidden" aria-hidden="true">
                    <label htmlFor="next-website">Website</label>
                    <input
                      id="next-website"
                      type="text"
                      tabIndex={-1}
                      autoComplete="off"
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="next-name" className="block text-xs font-semibold text-[#F0E9D9] mb-1.5">Full Name</label>
                      <input
                        ref={nameRef}
                        id="next-name"
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Alex Rivera"
                        className="w-full rounded-md border border-[#363125] bg-[#211D10] px-3.5 py-2.5 text-sm text-[#F0E9D9]"
                      />
                      {errors.name && <p role="alert" className="mt-1 text-xs text-[#E88A7E]">{errors.name}</p>}
                    </div>
                    <div>
                      <label htmlFor="next-email" className="block text-xs font-semibold text-[#F0E9D9] mb-1.5">Work Email</label>
                      <input
                        id="next-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="alex@company.com"
                        className="w-full rounded-md border border-[#363125] bg-[#211D10] px-3.5 py-2.5 text-sm text-[#F0E9D9]"
                      />
                      {errors.email && <p role="alert" className="mt-1 text-xs text-[#E88A7E]">{errors.email}</p>}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                    <div className="sm:col-span-5">
                      <label htmlFor="next-company" className="block text-xs font-semibold text-[#F0E9D9] mb-1.5">Company Name</label>
                      <input
                        id="next-company"
                        type="text"
                        value={company}
                        onChange={(e) => setCompany(e.target.value)}
                        placeholder="Northstar Automations"
                        className="w-full rounded-md border border-[#363125] bg-[#211D10] px-3.5 py-2.5 text-sm text-[#F0E9D9]"
                      />
                      {errors.company && <p role="alert" className="mt-1 text-xs text-[#E88A7E]">{errors.company}</p>}
                    </div>
                    <div className="sm:col-span-7">
                      <label htmlFor="next-subject" className="block text-xs font-semibold text-[#F0E9D9] mb-1.5">Subject</label>
                      <select
                        id="next-subject"
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        className="w-full rounded-md border border-[#363125] bg-[#211D10] px-3.5 pr-8 py-2.5 text-sm text-[#F0E9D9]"
                      >
                        {SUBJECT_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="next-message" className="block text-xs font-semibold text-[#F0E9D9] mb-1.5">Message</label>
                    <textarea
                      id="next-message"
                      rows={5}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Describe your workflow stack and automation goals..."
                      className="w-full rounded-md border border-[#363125] bg-[#211D10] px-3.5 py-2.5 text-sm text-[#F0E9D9]"
                    />
                    {errors.message && <p role="alert" className="mt-1 text-xs text-[#E88A7E]">{errors.message}</p>}
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex items-center gap-2 rounded-md bg-[#A51D0B] hover:bg-[#C52A18] disabled:opacity-50 px-6 py-2.5 text-sm font-semibold text-[#F0E9D9]"
                  >
                    <Send className="h-4 w-4" />
                    <span>{submitting ? 'Submitting...' : 'Submit Message'}</span>
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-[#363125] bg-[#171A1B] py-16 md:py-20">
        <div className="mx-auto max-w-[1320px] px-6 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="rounded-2xl border border-[#363125] bg-[#202326] p-6 space-y-4">
            <Activity className="h-5 w-5 text-[#C52A18]" />
            <h3 className="text-lg font-bold text-[#F0E9D9]">Building with Zevkar AI</h3>
            <p className="text-sm text-[#B8AE9B]">
              Discuss AI automation monitoring, intelligent diagnosis, incident detection, and human-approved recovery.
            </p>
            <div className="flex items-center gap-4 pt-2">
              <button
                type="button"
                onClick={() => handleSelectTopic('Building with Zevkar AI')}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#F0E9D9] hover:text-[#C52A18]"
              >
                <span>Start technical inquiry</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
              <Link href="/product" className="text-xs text-[#B8AE9B] underline">Product</Link>
            </div>
          </div>

          <div className="rounded-2xl border border-[#363125] bg-[#202326] p-6 space-y-4">
            <Handshake className="h-5 w-5 text-[#C52A18]" />
            <h3 className="text-lg font-bold text-[#F0E9D9]">Business &amp; Partnerships</h3>
            <p className="text-sm text-[#B8AE9B]">
              Invite businesses, agencies, startups, and engineers to collaborate on multi-client monitoring.
            </p>
            <button
              type="button"
              onClick={() => handleSelectTopic('Business & Partnerships')}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#F0E9D9] hover:text-[#C52A18]"
            >
              <span>Propose a partnership</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="rounded-2xl border border-[#363125] bg-[#202326] p-6 space-y-4">
            <HelpCircle className="h-5 w-5 text-[#C52A18]" />
            <h3 className="text-lg font-bold text-[#F0E9D9]">General Questions</h3>
            <p className="text-sm text-[#B8AE9B]">
              Reach out directly via email for setup guidance, FastAPI webhooks, or deployment reviews.
            </p>
            <a
              href={`mailto:${FOUNDER_STORY.email}`}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#F0E9D9] hover:text-[#C52A18]"
            >
              <Mail className="h-3.5 w-3.5 text-[#C52A18]" />
              <span>{FOUNDER_STORY.email}</span>
            </a>
          </div>
        </div>
      </section>
    </NextMarketingShell>
  );
}
