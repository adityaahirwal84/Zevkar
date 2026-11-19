import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, DM_Sans, JetBrains_Mono } from 'next/font/google';
import { AuthProvider } from '@/components/AuthProvider';
import { QueryProvider } from '@/components/QueryProvider';
import './globals.css';

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['500', '600', '700', '800'],
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  weight: ['400', '500', '600', '700'],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500', '600'],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'),
  title: 'Zevkar AI — Automation Monitoring, Diagnosis & Recovery Platform',
  description:
    'AI-powered automation monitoring, diagnosis and recovery platform for business workflows across n8n, webhooks, Python, and FastAPI.',
  alternates: {
    canonical: './',
  },
  icons: {
    icon: '/favicon.svg',
  },
  manifest: '/manifest.webmanifest',
  openGraph: {
    title: 'Zevkar AI — Automation Monitoring, Diagnosis & Recovery Platform',
    description:
      'AI-powered automation monitoring, diagnosis and recovery platform for business workflows across n8n, webhooks, Python, and FastAPI.',
    siteName: 'Zevkar AI',
    type: 'website',
    images: ['/og-image.svg'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Zevkar AI — Automation Monitoring, Diagnosis & Recovery Platform',
    description:
      'AI-powered automation monitoring, diagnosis and recovery platform for business workflows across n8n, webhooks, Python, and FastAPI.',
    images: ['/og-image.svg'],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${plusJakarta.variable} ${dmSans.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-screen bg-[#211D10] text-[#F0E9D9] antialiased selection:bg-[#A51D0B] selection:text-[#F0E9D9]">
        <QueryProvider>
          <AuthProvider>{children}</AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
