import React from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Clock, ShieldAlert } from 'lucide-react';

export type BadgeTone = 'success' | 'warning' | 'error' | 'neutral' | 'accent';

interface StatusBadgeProps {
  label: string;
  tone?: BadgeTone;
  withIcon?: boolean;
}

const TONE_STYLES: Record<BadgeTone, string> = {
  success: 'border-[#2E4A36] bg-[#1C2A20] text-[#8CC59B]',
  warning: 'border-[#544021] bg-[#292114] text-[#E2B066]',
  error: 'border-[#61231C] bg-[#2B1513] text-[#E88A7E]',
  accent: 'border-[#A51B0B]/60 bg-[#A51B0B]/15 text-[#F2B8B1]',
  neutral: 'border-[#383838] bg-[#242424] text-[#B5AA99]',
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  label,
  tone = 'neutral',
  withIcon = false,
}) => {
  const Icon =
    tone === 'success'
      ? CheckCircle2
      : tone === 'warning'
      ? Clock
      : tone === 'error'
      ? XCircle
      : tone === 'accent'
      ? ShieldAlert
      : AlertTriangle;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[11px] font-medium tracking-wide whitespace-nowrap shrink-0 tabular-nums ${TONE_STYLES[tone]}`}
    >
      {withIcon && <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />}
      <span>{label}</span>
    </span>
  );
};
