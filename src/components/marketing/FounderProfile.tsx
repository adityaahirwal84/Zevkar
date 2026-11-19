import React, { useState } from 'react';
import { ArrowUpRight, Github, Linkedin, Mail } from 'lucide-react';
import { FOUNDER_PROFILE, SocialLinkItem } from '../../lib/founder';

function renderSocialIcon(id: SocialLinkItem['id']) {
  switch (id) {
    case 'linkedin':
      return <Linkedin className="h-4 w-4 shrink-0" aria-hidden="true" />;
    case 'github':
      return <Github className="h-4 w-4 shrink-0" aria-hidden="true" />;
    case 'twitter':
      return (
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          className="h-3.5 w-3.5 shrink-0"
          aria-hidden="true"
        >
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      );
    case 'email':
      return <Mail className="h-4 w-4 shrink-0" aria-hidden="true" />;
  }
}

export const FounderProfile: React.FC = () => {
  const [photoFailed, setPhotoFailed] = useState(false);
  const [socialNotice, setSocialNotice] = useState<string | null>(null);

  return (
    <article className="lg:pr-6 space-y-8">
      {/* Founder Identity */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-5">
        <div className="relative h-24 w-24 sm:h-28 sm:w-28 shrink-0 rounded-full border-2 border-[#A51D0B]/70 bg-[#211D10] p-1">
          <div className="h-full w-full rounded-full overflow-hidden bg-[#171A1B] flex items-center justify-center">
            {!photoFailed ? (
              <img
                src={FOUNDER_PROFILE.photoPath}
                alt={`${FOUNDER_PROFILE.name} — ${FOUNDER_PROFILE.designation}`}
                referrerPolicy="no-referrer"
                onError={() => setPhotoFailed(true)}
                className="h-full w-full object-cover scale-[1.06]"
              />
            ) : (
              <span
                aria-label={`${FOUNDER_PROFILE.name} initials`}
                className="font-[var(--font-display)] text-2xl font-bold tracking-tight text-[#F0E9D9]"
              >
                {FOUNDER_PROFILE.initials}
              </span>
            )}
          </div>
        </div>

        <div className="space-y-1 min-w-0">
          <h2 className="font-[var(--font-display)] text-2xl sm:text-3xl font-bold tracking-tight text-[#F0E9D9]">
            {FOUNDER_PROFILE.name}
          </h2>
          <p className="text-sm font-medium text-[#C52A18]">
            {FOUNDER_PROFILE.designation}
          </p>
          <a
            href={`mailto:${FOUNDER_PROFILE.email}`}
            className="inline-flex items-center gap-1.5 pt-1 text-xs text-[#B8AE9B] hover:text-[#F0E9D9] transition-colors"
          >
            <Mail className="h-3.5 w-3.5 text-[#B8AE9B]" aria-hidden="true" />
            <span>{FOUNDER_PROFILE.email}</span>
          </a>
        </div>
      </div>

      {/* Founder Story */}
      <div className="space-y-5 border-t border-[#363125] pt-7 text-[15px] sm:text-base leading-[1.75] text-[#B8AE9B] max-w-xl">
        {FOUNDER_PROFILE.introParagraphs.map((paragraph, index) => (
          <p key={index} className={index === 0 ? 'text-[#F0E9D9] font-medium' : undefined}>
            {paragraph}
          </p>
        ))}
      </div>

      {/* Social Links */}
      <div className="border-t border-[#363125] pt-6 space-y-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          {FOUNDER_PROFILE.socialLinks.map((link) =>
            link.isConfigured && link.href ? (
              <a
                key={link.id}
                href={link.href}
                target={link.external ? '_blank' : undefined}
                rel={link.external ? 'noopener noreferrer' : undefined}
                className="inline-flex items-center gap-2 text-sm font-medium text-[#B8AE9B] hover:text-[#F0E9D9] transition-colors whitespace-nowrap"
              >
                <span className="text-[#B8AE9B]">{renderSocialIcon(link.id)}</span>
                <span>{link.label}</span>
                <ArrowUpRight className="h-3.5 w-3.5 text-[#B8AE9B]" aria-hidden="true" />
              </a>
            ) : (
              <button
                key={link.id}
                type="button"
                onClick={() =>
                  setSocialNotice((prev) =>
                    prev === link.placeholderNote ? null : link.placeholderNote || `${link.label} URL is not configured yet.`
                  )
                }
                className="inline-flex items-center gap-2 text-sm font-medium text-[#B8AE9B] hover:text-[#F0E9D9] transition-colors whitespace-nowrap"
              >
                <span>{renderSocialIcon(link.id)}</span>
                <span>{link.label}</span>
              </button>
            )
          )}
        </div>

        {socialNotice && (
          <p className="text-xs text-[#B8AE9B] leading-relaxed">
            {socialNotice}
          </p>
        )}
      </div>
    </article>
  );
};
