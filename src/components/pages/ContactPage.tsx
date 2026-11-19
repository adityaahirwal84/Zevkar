import React, { useState } from 'react';
import { AppRoute } from '../../lib/router';
import { MarketingShell } from './MarketingShell';
import { FounderProfile } from '../marketing/FounderProfile';
import { ContactForm } from '../marketing/ContactForm';

interface ContactPageProps {
  onNavigate: (route: AppRoute) => void;
}

export const ContactPage: React.FC<ContactPageProps> = ({ onNavigate }) => {
  const [selectedSubject] = useState<string | undefined>(undefined);
  const [focusTrigger] = useState<number>(0);

  return (
    <MarketingShell currentRoute="/contact" onNavigate={onNavigate}>
      <section className="border-b border-[#363125] bg-[#211D10] py-16 md:py-20">
        <div className="mx-auto max-w-[1320px] px-6 space-y-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-[#C52A18]">
            Contact
          </div>
          <h1 className="font-[var(--font-display)] text-4xl sm:text-5xl font-extrabold tracking-tight text-[#F0E9D9] max-w-3xl">
            Reach the team behind Zevkar AI.
          </h1>
          <p className="text-base text-[#B8AE9B] max-w-2xl leading-relaxed">
            Questions about n8n synchronization, FastAPI webhook reporting, workspace onboarding, or partnerships—let&apos;s connect.
          </p>
        </div>
      </section>

      <section className="bg-[#171A1B] py-16 md:py-20">
        <div className="mx-auto max-w-[1320px] px-6 grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
          <div className="lg:col-span-5">
            <FounderProfile />
          </div>
          <div className="lg:col-span-7">
            <ContactForm selectedSubject={selectedSubject} focusTrigger={focusTrigger} />
          </div>
        </div>
      </section>
    </MarketingShell>
  );
};
