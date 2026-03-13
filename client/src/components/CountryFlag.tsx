/**
 * CountryFlag — renders the appropriate flag/logo for a country.
 * For Viconis, renders the actual brand logo instead of an emoji.
 * For all other countries, renders the emoji flag as a span.
 */

import ViconisLogo from './ViconisLogo';

interface CountryFlagProps {
  /** Country slug or flag emoji */
  country?: string;
  /** Flag emoji (if provided directly) */
  flag?: string;
  /** CSS class for sizing — applied to both img and span */
  className?: string;
}

/**
 * Determine if this is a Viconis entry based on country slug or flag emoji.
 */
function isViconis(country?: string, flag?: string): boolean {
  if (country?.toLowerCase() === 'viconis') return true;
  if (flag === '💎') return true;
  return false;
}

export default function CountryFlag({ country, flag, className }: CountryFlagProps) {
  if (isViconis(country, flag)) {
    return <ViconisLogo className={className || 'h-4 w-auto'} />;
  }
  return <span className={className}>{flag || '🌍'}</span>;
}

export { isViconis };
