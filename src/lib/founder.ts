export interface SocialLinkItem {
  id: 'linkedin' | 'github' | 'twitter' | 'email';
  label: string;
  href: string;
  displayText: string;
  isConfigured: boolean;
  external: boolean;
  placeholderNote?: string;
}

export const FOUNDER_PROFILE = {
  name: 'Aditya Ahirwal',
  designation: 'Founder, Zevkar AI',
  company: 'Zevkar AI',
  slogan: 'AI-powered automation monitoring, diagnosis, and recovery.',
  photoPath: '/picofme.jpg',
  initials: 'AA',
  email: 'aditya84azm@gmail.com',
  introParagraphs: [
    "I'm Aditya, the founder of Zevkar AI. I'm building this platform to make business automations more reliable, transparent, and easier to manage.",
    "As businesses depend more on automated workflows for important operations, a failed step is rarely just a technical glitch. It can mean missed opportunities, delayed work, frustrated customers, and hours spent piecing together what broke—often long after it began affecting the business.",
    "I started Zevkar AI around a simple idea: teams shouldn't have to watch their workflows or guess why something stopped working. The platform monitors executions, spots failures early, explains the likely root cause, and supports safe recovery with the right human oversight—so operators spend less time firefighting broken automations.",
  ],
  socialLinks: [
    {
      id: 'linkedin',
      label: 'LinkedIn',
      href: '',
      displayText: 'LinkedIn',
      isConfigured: false,
      external: true,
      placeholderNote: 'LinkedIn profile URL is awaiting configuration in src/lib/founder.ts — reach out directly via aditya84azm@gmail.com.',
    },
    {
      id: 'github',
      label: 'GitHub',
      href: '',
      displayText: 'GitHub',
      isConfigured: false,
      external: true,
      placeholderNote: 'GitHub profile URL is awaiting configuration in src/lib/founder.ts — reach out directly via aditya84azm@gmail.com.',
    },
    {
      id: 'twitter',
      label: 'X / Twitter',
      href: '',
      displayText: 'X / Twitter',
      isConfigured: false,
      external: true,
      placeholderNote: 'X / Twitter profile URL is awaiting configuration in src/lib/founder.ts — reach out directly via aditya84azm@gmail.com.',
    },
  ] as SocialLinkItem[],
};
