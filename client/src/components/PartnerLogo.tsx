/**
 * PartnerLogo — renders the delivery partner logo image or falls back to text.
 * Partners: colivraison, ecomamanager, ecotrack_dhd, sellmax
 */

const PARTNER_LOGOS: Record<string, { src: string; alt: string }> = {
  colivraison: {
    src: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663100505681/BGqs7KPXdQCKEiUP6wXDFD/colivraison-logo_d4e03840.png',
    alt: 'Colivraison',
  },
  ecomamanager: {
    src: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663100505681/BGqs7KPXdQCKEiUP6wXDFD/ecomanager-logo_3f1ba0b8.png',
    alt: 'Ecomanager',
  },
  ecotrack_dhd: {
    src: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663100505681/BGqs7KPXdQCKEiUP6wXDFD/dhd-livraison-logo_0cd9c98c.png',
    alt: 'DHD Livraison',
  },
  sellmax: {
    src: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663100505681/BGqs7KPXdQCKEiUP6wXDFD/sellmax-logo_f8e621c7.png',
    alt: 'Sellmax',
  },
};

interface PartnerLogoProps {
  partner: string;
  className?: string;
}

export default function PartnerLogo({ partner, className = 'h-4 w-auto' }: PartnerLogoProps) {
  const logo = PARTNER_LOGOS[partner];
  if (!logo) return null;
  return (
    <img
      src={logo.src}
      alt={logo.alt}
      className={`inline-block object-contain ${className}`}
    />
  );
}

export { PARTNER_LOGOS };
