import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

export interface FAQItem {
  question: string;
  answer: string;
}

interface FAQSectionProps {
  items: FAQItem[];
  title?: string;
  subtitle?: string;
}

export const FAQSection: React.FC<FAQSectionProps> = ({
  items,
  title = 'Frequently Asked Questions',
  subtitle = 'Clear answers about architecture, platform connectors, and recovery safety.',
}) => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section className="border-t border-[#363125] bg-[#171A1B] py-20">
      <div className="mx-auto max-w-[900px] px-6">
        <div className="mb-12 space-y-3">
          <h2 className="font-[var(--font-display)] text-2xl sm:text-3xl font-bold text-[#F0E9D9]">
            {title}
          </h2>
          <p className="text-sm sm:text-base text-[#B8AE9B]">{subtitle}</p>
        </div>

        <div className="divide-y divide-[#363125] border-y border-[#363125]">
          {items.map((item, idx) => {
            const isOpen = openIndex === idx;
            return (
              <div key={item.question} className="py-5">
                <button
                  type="button"
                  onClick={() => setOpenIndex(isOpen ? null : idx)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-4 text-left"
                >
                  <span className="text-base font-semibold text-[#F0E9D9]">
                    {item.question}
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 text-[#B8AE9B] shrink-0 transition-transform duration-200 ${
                      isOpen ? 'rotate-180 text-[#F0E9D9]' : ''
                    }`}
                    aria-hidden="true"
                  />
                </button>
                {isOpen && (
                  <p className="mt-3 text-sm leading-relaxed text-[#B8AE9B] pr-8">
                    {item.answer}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
