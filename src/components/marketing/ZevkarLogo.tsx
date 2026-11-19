import React from 'react';

interface ZevkarLogoProps {
  size?: 'sm' | 'md';
  wordmark?: 'Zevkar' | 'Zevkar AI';
  showTagline?: boolean;
  showDomainSuffix?: boolean;
}

export const ZevkarLogo: React.FC<ZevkarLogoProps> = ({
  size = 'md',
  wordmark = 'Zevkar',
}) => {
  const iconSize = size === 'sm' ? 'h-8 w-8' : 'h-8 w-8 sm:h-9 sm:w-9';

  return (
    <span className="inline-flex items-center gap-2.5 text-[#F0E9D9] whitespace-nowrap shrink-0">
      <img
        src="/favicon.svg"
        alt=""
        aria-hidden="true"
        width={36}
        height={36}
        className={`${iconSize} aspect-square shrink-0 object-contain select-none transition-transform duration-150 group-hover:scale-[1.03]`}
      />
      <span className="font-[var(--font-display)] text-base sm:text-[17px] font-bold tracking-tight leading-none text-[#F0E9D9]">
        {wordmark}
      </span>
    </span>
  );
};
