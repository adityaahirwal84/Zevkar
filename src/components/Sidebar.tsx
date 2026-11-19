import React from 'react';
import {
  LayoutDashboard,
  AlertOctagon,
  Stethoscope,
  RotateCcw,
  ShieldAlert,
  GitBranch,
  Users,
  Cable,
  BarChart3,
  BellRing,
  Bot,
  UserCheck,
  CreditCard,
  Settings,
  FileText,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { ZevkarLogo } from './marketing/ZevkarLogo';

export type NavTab =
  | 'overview'
  | 'control-center'
  | 'incidents'
  | 'diagnosis'
  | 'recovery'
  | 'approvals'
  | 'workflows'
  | 'clients'
  | 'integrations'
  | 'analytics'
  | 'alerts'
  | 'assistant'
  | 'audit'
  | 'team'
  | 'billing'
  | 'settings';

interface SidebarProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  activeIncidentsCount: number;
  pendingApprovalsCount: number;
  workflowsCount?: number;
  clientsCount?: number;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  activeIncidentsCount,
  pendingApprovalsCount,
  workflowsCount = 12,
  clientsCount = 4,
  mobileOpen = false,
  onCloseMobile,
}) => {
  const navSections = [
    {
      group: 'MONITOR & DIAGNOSE',
      items: [
        { id: 'overview', label: 'Overview', icon: LayoutDashboard },
        { id: 'control-center', label: 'Control Center', icon: SlidersHorizontal },
        {
          id: 'incidents',
          label: 'Incidents',
          icon: AlertOctagon,
          badge: activeIncidentsCount > 0 ? activeIncidentsCount : undefined,
          badgeStyle: 'border-[#61231C] bg-[#2B1513] text-[#E88A7E]',
        },
        { id: 'diagnosis', label: 'AI Diagnosis', icon: Stethoscope },
        { id: 'recovery', label: 'Recovery Center', icon: RotateCcw },
        {
          id: 'approvals',
          label: 'Approvals',
          icon: ShieldAlert,
          badge: pendingApprovalsCount > 0 ? pendingApprovalsCount : undefined,
          badgeStyle: 'border-[#544021] bg-[#292114] text-[#E2B066]',
        },
      ],
    },
    {
      group: 'ASSETS & INTEGRATIONS',
      items: [
        { id: 'workflows', label: 'Workflows', icon: GitBranch },
        { id: 'clients', label: 'Clients', icon: Users },
        { id: 'integrations', label: 'Integrations', icon: Cable },
      ],
    },
    {
      group: 'INTELLIGENCE & AUDIT',
      items: [
        { id: 'analytics', label: 'Analytics & Impact', icon: BarChart3 },
        { id: 'alerts', label: 'SLA & Alert Rules', icon: BellRing },
        { id: 'assistant', label: 'Zevkar Assistant', icon: Bot },
        { id: 'audit', label: 'Audit Log', icon: FileText },
      ],
    },
    {
      group: 'AGENCY & PLATFORM',
      items: [
        { id: 'team', label: 'Team Members', icon: UserCheck },
        { id: 'billing', label: 'Billing & Limits', icon: CreditCard },
        { id: 'settings', label: 'Settings & Security', icon: Settings },
      ],
    },
  ];

  const handleSelect = (tab: NavTab) => {
    onSelectTab(tab);
    if (onCloseMobile) onCloseMobile();
  };

  const navContent = (
    <div className="flex h-full flex-col justify-between p-4">
      <div className="space-y-6">
        {navSections.map((section) => (
          <div key={section.group}>
            <p className="px-3 text-[10px] font-semibold uppercase tracking-wider text-[#B5AA99]/75">
              {section.group}
            </p>
            <div className="mt-2 space-y-1">
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = currentTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelect(item.id as NavTab)}
                    className={`group flex w-full items-center justify-between rounded-md px-3 py-2 text-xs font-medium transition-colors ${
                      isActive
                        ? 'bg-[#A51B0B]/15 text-[#E9E5DC] border border-[#A51B0B]/50'
                        : 'text-[#B5AA99] border border-transparent hover:bg-[#202020] hover:text-[#E9E5DC]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon
                        className={`h-4 w-4 ${
                          isActive ? 'text-[#C52A18]' : 'text-[#B5AA99] group-hover:text-[#E9E5DC]'
                        }`}
                        aria-hidden="true"
                      />
                      <span>{item.label}</span>
                    </div>
                    {item.badge !== undefined && (
                      <span
                        className={`rounded border px-1.5 py-0.5 text-[10px] font-mono font-semibold tabular-nums ${item.badgeStyle}`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-lg border border-[#383838] bg-[#202020] p-3.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-[#E9E5DC]">Agent Guard</span>
          <span className="font-mono text-[11px] font-semibold text-[#8CC59B]">Active</span>
        </div>
        <p className="mt-1 text-[11px] text-[#B5AA99] tabular-nums">
          Monitoring {workflowsCount} workflows across {clientsCount} clients.
        </p>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block w-64 shrink-0 border-r border-[#363125] bg-[#171A1B]">
        {navContent}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/75"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="relative z-10 w-72 max-w-[85vw] h-full overflow-y-auto border-r border-[#363125] bg-[#171A1B]">
            <div className="flex items-center justify-between border-b border-[#363125] px-4 py-3">
              <ZevkarLogo size="sm" />
              <button
                type="button"
                onClick={onCloseMobile}
                className="rounded-md p-1.5 text-[#B8AE9B] hover:text-[#F0E9D9]"
                aria-label="Close console menu"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {navContent}
          </aside>
        </div>
      )}
    </>
  );
};
