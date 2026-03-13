/**
 * Viconis Logo — renders the Viconis brand logo at the specified size.
 * Use this instead of emoji/flag for Viconis entries throughout the dashboard.
 */

const VICONIS_LOGO_URL =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663100505681/BGqs7KPXdQCKEiUP6wXDFD/viconis-logo_e90ce37f.png";

interface ViconisLogoProps {
  /** CSS class for sizing — defaults to "h-4 w-auto" */
  className?: string;
}

export default function ViconisLogo({ className = "h-4 w-auto" }: ViconisLogoProps) {
  return (
    <img
      src={VICONIS_LOGO_URL}
      alt="Viconis"
      className={`inline-block object-contain ${className}`}
    />
  );
}

export { VICONIS_LOGO_URL };
