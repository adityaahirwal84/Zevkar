import React from 'react';
import { AppRoute } from '../../lib/router';
import { FOUNDER_PROFILE } from '../../lib/founder';
import { ZevkarLogo } from './ZevkarLogo';

interface FooterProps {
  onNavigate: (route: AppRoute) => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigate }) => {
  const handleNav = (e: React.MouseEvent, route: AppRoute) => {
    e.preventDefault();
    onNavigate(route);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <footer className="border-t border-[#363125] bg-[#211D10] text-[#B8AE9B]">
      <div className="mx-auto max-w-[1320px] px-6 py-16">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-6">
          {/* Brand Column */}
          <div className="lg:col-span-2 space-y-4">
            <a
              href="/"
              onClick={(e) => handleNav(e, '/')}
              className="group inline-flex items-center"
              aria-label="Zevkar AI home"
            >
              <ZevkarLogo wordmark="Zevkar AI" />
            </a>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#C52A18]">
              AI-Powered Automation Monitoring, Diagnosis &amp; Recovery.
            </p>
            <p className="max-w-sm text-sm leading-relaxed text-[#B8AE9B]">
              Monitor, diagnose, and recover your business automations before failures impact your operations.
            </p>
            <div className="pt-1 flex flex-wrap items-center gap-3 text-xs">
              <a
                href={`mailto:${FOUNDER_PROFILE.email}`}
                className="text-[#F0E9D9] hover:text-[#C52A18] transition-colors underline decoration-[#363125]"
              >
                {FOUNDER_PROFILE.email}
              </a>
              <span aria-hidden="true">·</span>
              <a
                href="/contact"
                onClick={(e) => handleNav(e, '/contact')}
                className="hover:text-[#F0E9D9] transition-colors"
              >
                Founder &amp; Contact
              </a>
            </div>
          </div>

          {/* Product */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#F0E9D9] mb-4">
              Product
            </h3>
            <ul className="space-y-2.5 text-sm">
              <li>
                <a href="/product" onClick={(e) => handleNav(e, '/product')} className="hover:text-[#F0E9D9] transition-colors">
                  Product Overview
                </a>
              </li>
              <li>
                <a href="/features" onClick={(e) => handleNav(e, '/features')} className="hover:text-[#F0E9D9] transition-colors">
                  Features
                </a>
              </li>
              <li>
                <a href="/how-it-works" onClick={(e) => handleNav(e, '/how-it-works')} className="hover:text-[#F0E9D9] transition-colors">
                  How It Works
                </a>
              </li>
              <li>
                <a href="/use-cases" onClick={(e) => handleNav(e, '/use-cases')} className="hover:text-[#F0E9D9] transition-colors">
                  Use Cases
                </a>
              </li>
              <li>
                <a href="/pricing" onClick={(e) => handleNav(e, '/pricing')} className="hover:text-[#F0E9D9] transition-colors">
                  Pricing
                </a>
              </li>
            </ul>
          </div>

          {/* Integrations */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#F0E9D9] mb-4">
              Integrations
            </h3>
            <ul className="space-y-2.5 text-sm">
              <li>
                <a href="/integrations" onClick={(e) => handleNav(e, '/integrations')} className="hover:text-[#F0E9D9] transition-colors">
                  n8n (Available)
                </a>
              </li>
              <li>
                <a href="/integrations" onClick={(e) => handleNav(e, '/integrations')} className="hover:text-[#F0E9D9] transition-colors">
                  Custom Webhooks
                </a>
              </li>
              <li>
                <a href="/integrations" onClick={(e) => handleNav(e, '/integrations')} className="hover:text-[#F0E9D9] transition-colors">
                  Python &amp; FastAPI
                </a>
              </li>
              <li>
                <a href="/integrations" onClick={(e) => handleNav(e, '/integrations')} className="hover:text-[#F0E9D9] transition-colors">
                  Zapier &amp; Make Status
                </a>
              </li>
            </ul>
          </div>

          {/* Resources & Docs */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#F0E9D9] mb-4">
              Resources
            </h3>
            <ul className="space-y-2.5 text-sm">
              <li>
                <a href="/docs" onClick={(e) => handleNav(e, '/docs')} className="hover:text-[#F0E9D9] transition-colors">
                  Documentation
                </a>
              </li>
              <li>
                <a href="/blog" onClick={(e) => handleNav(e, '/blog')} className="hover:text-[#F0E9D9] transition-colors">
                  Engineering Blog
                </a>
              </li>
              <li>
                <a href="/developers" onClick={(e) => handleNav(e, '/developers')} className="hover:text-[#F0E9D9] transition-colors">
                  API Reference
                </a>
              </li>
              <li>
                <a href="/dashboard" onClick={(e) => handleNav(e, '/dashboard')} className="hover:text-[#F0E9D9] transition-colors">
                  Live Console
                </a>
              </li>
            </ul>
          </div>

          {/* Company & Legal */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#F0E9D9] mb-4">
              Company &amp; Legal
            </h3>
            <ul className="space-y-2.5 text-sm">
              <li>
                <a href="/about" onClick={(e) => handleNav(e, '/about')} className="hover:text-[#F0E9D9] transition-colors">
                  About
                </a>
              </li>
              <li>
                <a href="/contact" onClick={(e) => handleNav(e, '/contact')} className="hover:text-[#F0E9D9] transition-colors">
                  Contact
                </a>
              </li>
              <li>
                <a href="/privacy" onClick={(e) => handleNav(e, '/privacy')} className="hover:text-[#F0E9D9] transition-colors">
                  Privacy Policy (Draft)
                </a>
              </li>
              <li>
                <a href="/terms" onClick={(e) => handleNav(e, '/terms')} className="hover:text-[#F0E9D9] transition-colors">
                  Terms of Service (Draft)
                </a>
              </li>
              <li>
                <a href="/cookies" onClick={(e) => handleNav(e, '/cookies')} className="hover:text-[#F0E9D9] transition-colors">
                  Cookie Policy (Draft)
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-14 pt-8 border-t border-[#363125] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-[#B8AE9B]">
          <p>© {new Date().getFullYear()} Zevkar AI. All rights reserved.</p>
          <p>
            Workflow Observability · Gemini AI Diagnosis · Approval-Gated Recovery
          </p>
        </div>
      </div>
    </footer>
  );
};
