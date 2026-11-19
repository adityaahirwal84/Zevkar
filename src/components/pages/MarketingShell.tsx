import React from 'react';
import { AppRoute } from '../../lib/router';
import { MarketingNavbar } from '../marketing/MarketingNavbar';
import { Footer } from '../marketing/Footer';

interface MarketingShellProps {
  currentRoute: AppRoute;
  onNavigate: (route: AppRoute) => void;
  children: React.ReactNode;
}

export const MarketingShell: React.FC<MarketingShellProps> = ({
  currentRoute,
  onNavigate,
  children,
}) => {
  return (
    <div className="min-h-screen flex flex-col bg-[#211D10] text-[#F0E9D9]">
      <MarketingNavbar currentRoute={currentRoute} onNavigate={onNavigate} />
      <main className="flex-1">{children}</main>
      <Footer onNavigate={onNavigate} />
    </div>
  );
};
