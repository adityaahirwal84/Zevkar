import React, { useState } from 'react';
import { ArrowRight, Terminal, Cable, Clock, BookOpen } from 'lucide-react';
import { AppRoute } from '../../lib/router';
import {
  INTEGRATION_DIRECTORY,
  IntegrationAvailability,
} from '../../lib/integrations-catalog';
import { StatusBadge } from './StatusBadge';

interface IntegrationGridProps {
  onNavigate: (route: AppRoute) => void;
  showSetupDetails?: boolean;
  enableFilter?: boolean;
}

type FilterOption = 'All' | IntegrationAvailability;

function availabilityTone(availability: IntegrationAvailability): 'success' | 'warning' | 'neutral' {
  switch (availability) {
    case 'Available':
      return 'success';
    case 'In Development':
      return 'warning';
    case 'Planned':
    default:
      return 'neutral';
  }
}

export const IntegrationGrid: React.FC<IntegrationGridProps> = ({
  onNavigate,
  showSetupDetails = false,
  enableFilter = true,
}) => {
  const [filter, setFilter] = useState<FilterOption>('All');
  const [expandedId, setExpandedId] = useState<string | null>(showSetupDetails ? 'n8n' : null);

  const filterOptions: FilterOption[] = ['All', 'Available', 'In Development', 'Planned'];
  const visibleItems =
    filter === 'All'
      ? INTEGRATION_DIRECTORY
      : INTEGRATION_DIRECTORY.filter((item) => item.availability === filter);

  return (
    <div className="space-y-8">
      {enableFilter && (
        <div
          className="inline-flex flex-wrap items-center gap-1.5 rounded-lg border border-[#363125] bg-[#171A1B] p-1"
          role="group"
          aria-label="Filter integrations by availability"
        >
          {filterOptions.map((opt) => {
            const active = filter === opt;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => setFilter(opt)}
                className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-[#A51D0B] text-[#F0E9D9]'
                    : 'text-[#B8AE9B] hover:text-[#F0E9D9]'
                }`}
              >
                {opt}
              </button>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {visibleItems.map((item) => {
          const isExpanded = expandedId === item.id;
          return (
            <div
              key={item.id}
              className="flex flex-col justify-between rounded-xl border border-[#363125] bg-[#171A1B] p-6 transition-colors hover:border-[#B8AE9B]/50"
            >
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs text-[#B8AE9B]">{item.category}</div>
                    <h3 className="mt-1 font-[var(--font-display)] text-xl font-bold text-[#F0E9D9]">
                      {item.name}
                    </h3>
                  </div>
                  <StatusBadge label={item.availability} tone={availabilityTone(item.availability)} />
                </div>

                <p className="text-sm leading-relaxed text-[#B8AE9B]">{item.description}</p>

                <ul className="space-y-1.5 text-xs text-[#F0E9D9]/85 border-t border-[#363125] pt-3">
                  {item.verifiedCapabilities.map((cap) => (
                    <li key={cap} className="leading-relaxed">
                      · {cap}
                    </li>
                  ))}
                </ul>

                {showSetupDetails && (
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : item.id)}
                      aria-expanded={isExpanded}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#F0E9D9] hover:text-[#C52A18] transition-colors"
                    >
                      <Terminal className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{isExpanded ? 'Hide setup steps' : 'View setup steps'}</span>
                    </button>

                    {isExpanded && (
                      <ol className="mt-3 space-y-2 rounded-lg border border-[#363125] bg-[#211D10] p-3.5 text-xs text-[#B8AE9B] list-decimal list-inside">
                        {item.setupSteps.map((step) => (
                          <li key={step} className="leading-relaxed">
                            {step}
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-6 pt-4 border-t border-[#363125] flex items-center justify-between gap-3">
                {item.canConnectDirectly ? (
                  <button
                    type="button"
                    onClick={() => onNavigate('/dashboard')}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#F0E9D9] hover:text-[#C52A18] transition-colors"
                  >
                    <Cable className="h-3.5 w-3.5 text-[#C52A18]" aria-hidden="true" />
                    <span>Connect in Console</span>
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs text-[#B8AE9B]">
                    <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Planned</span>
                  </span>
                )}

                <button
                  type="button"
                  onClick={() => onNavigate('/docs')}
                  className="inline-flex items-center gap-1 text-xs text-[#B8AE9B] hover:text-[#F0E9D9] transition-colors"
                >
                  <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Docs</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
