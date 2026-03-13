/**
 * Lead Parser — Multi-company support
 * 
 * Supports: Sellmax (Tunisia), Ecomamanager (Algeria)
 * 
 * Sellmax (Tunisia):
 *   Tab-separated Shopify export with order#, date, name, phone, address
 *   Output: 29 columns, phone=8 digits (remove 216)
 *   Fixed: shopName=SOUKTN, countryCode=TN, offerValue=87, sku=TestiIcalm, status=NEW
 * 
 * Ecomamanager (Algeria):
 *   THREE paste formats auto-detected:
 *   1. Tab-separated: columns with tabs between them (Shopify sheet copy)
 *   2. Concatenated: no tabs, data runs together on few lines (confirmed orders)
 *   3. Multi-line: each field on its own line, with junk metadata mixed in (abandoned leads)
 *   
 *   Phone (+213...) is always the anchor for splitting leads.
 *   Wilaya: pattern "XX - City" or "-" for empty.
 *   Upsell: detected via Arabic text "اشتري قطعتين و وفر" OR price=5800.
 *   
 *   Output: 14 columns, phone=10 digits (remove +213)
 *   Fixed: SKU=TES, prix=3800, qty=1 or 2 based on upsell
 */

export type CompanyId = 'sellmax' | 'ecomamanager' | 'colivraison' | 'ecotrack_dhd';

export interface CompanyConfig {
  id: CompanyId;
  name: string;
  country: string;
  description: string;
  headers: string[];
  placeholderText: string;
}

// ===== COLIVRAISON PRODUCT CONFIG =====

export interface ColivraisonProductConfig {
  id: string;
  name: string;
  productLabel: string;
  priceRules: { price: number; qty: number }[];
}

export const COLIVRAISON_PRODUCTS: ColivraisonProductConfig[] = [
  {
    id: 'testicalm',
    name: 'Testicalm',
    productLabel: '\u0645\u0631\u0647\u0645 \u062f\u0648\u0627\u0644\u064a \u0627\u0644\u062e\u0635\u064a\u062a\u064a\u0646 testicalm',
    priceRules: [
      { price: 3800, qty: 1 },
      { price: 5800, qty: 2 },
    ],
  },
];

// ===== PARSED LEAD (common intermediate format) =====

export interface ParsedLead {
  /** For Sellmax: order number. For Ecomamanager: not used */
  referenceNumber: string;
  name: string;
  primaryPhoneNumber: string;
  /** For Sellmax: full address. For Ecomamanager: wilaya */
  fullAddress: string;
  rawPhone: string;
  /** Original price from Shopify data (for Ecomamanager upsell detection) */
  originalPrice?: number;
  /** Product name from Shopify data (for Sellmax: testicalm vs prostacalm) */
  productName?: string;
  /** Ad source / campaign name (for Sellmax: column 9 after price) */
  adSource?: string;
}

// ===== SELLMAX =====

export interface SellmaxRow {
  shopName: string;
  referenceNumber: string;
  name: string;
  primaryPhoneNumber: string;
  fullAddress: string;
  city: string;
  province: string;
  countryCode: string;
  zipCode: string;
  offerValue: string;
  offerCurrency: string;
  sku: string;
  value: string;
  currency: string;
  description: string;
  quantity: string;
  status: string;
  offerId: string;
  creationDate: string;
  confirmationDate: string;
  offerUrl: string;
  webMaster: string;
  longitude: string;
  lattitude: string;
  location: string;
  secondaryPhoneNumber: string;
  confirmationType: string;
  upsell: string;
  productLink: string;
}

export const SELLMAX_HEADERS = [
  'shopName', 'referenceNumber', 'name', 'primaryPhoneNumber', 'fullAddress',
  'city', 'province', 'countryCode', 'zipCode', 'offerValue', 'offerCurrency',
  'sku', 'value', 'currency', 'description', 'quantity', 'status',
  'offerId', 'creationDate', 'confirmationDate', 'offerUrl', 'webMaster',
  'longitude', 'lattitude', 'location', 'secondaryPhoneNumber',
  'confirmationType', 'upsell', 'productLink',
];

// ===== COLIVRAISON =====

export interface ColivraisonRow {
  Nom: string;
  Tel1: string;
  Tel2: string;
  Adresse: string;
  Commune: string;
  Wilaya: string;
  Produit: string;
  Variant: string;
  Qte: string;
  Prix: string;
  Remarque: string;
  Ref: string;
  Fragile: string;
  Testable: string;
  SKU: string;
  Weight: string;
  Exchange: string;
}

export const COLIVRAISON_HEADERS = [
  'Nom', 'Tel1', 'Tel2', 'Adresse', 'Commune', 'Wilaya',
  'Produit', 'Variant', 'Qte', 'Prix', 'Remarque', 'Ref',
  'Fragile', 'Testable', 'SKU', 'Weight', 'Exchange',
];

// ===== ECOTRACK DHD =====

export interface EcotrackRow {
  'reference commande': string;
  'nom et prenom du destinataire*': string;
  'telephone*': string;
  'telephone 2': string;
  'code wilaya*': string;
  'wilaya de livraison': string;
  'commune de livraison*': string;
  'adresse de livraison*': string;
  'produit (référence)*': string;
  'quantité*': string;
  'poids (kg)': string;
  'montant du colis*': string;
  'remarque': string;
  'FRAGILE': string;
  'ESSAYAGE PERMI': string;
  'ECHANGE': string;
  'STOP DESK': string;
  'Lien map': string;
}

export const ECOTRACK_HEADERS = [
  'reference commande',
  'nom et prenom du destinataire*',
  'telephone*',
  'telephone 2',
  'code wilaya*',
  'wilaya de livraison',
  'commune de livraison*',
  'adresse de livraison*',
  'produit (référence)*',
  'quantité*',
  'poids (kg)',
  'montant du colis*',
  'remarque',
  'FRAGILE',
  'ESSAYAGE PERMI',
  'ECHANGE',
  'STOP DESK',
  'Lien map',
];

// ===== ECOMAMANAGER =====

export interface EcomamanagerRow {
  'Client*': string;
  'Téléphone*': string;
  'Téléphone 2': string;
  'Wilaya*': string;
  'Commune': string;
  'Adresse': string;
  'Remarque': string;
  'Produit (SKU)*': string;
  'Quantité*': string;
  'Prix unitaire': string;
  'Frais de livraison': string;
  'Réduction': string;
  'Référent': string;
  'Stop desk': string;
}

export const ECOMAMANAGER_HEADERS = [
  'Client*', 'Téléphone*', 'Téléphone 2', 'Wilaya*', 'Commune', 'Adresse',
  'Remarque', 'Produit (SKU)*', 'Quantité*', 'Prix unitaire',
  'Frais de livraison', 'Réduction', 'Référent', 'Stop desk',
];

// ===== COMPANY CONFIGS =====

export const COMPANIES: Record<CompanyId, CompanyConfig> = {
  sellmax: {
    id: 'sellmax',
    name: 'Sellmax',
    country: 'Tunisia',
    description: 'Tunisia shipping — 29 columns, phone 8 digits',
    headers: SELLMAX_HEADERS,
    placeholderText: '#2233\t2026-01-18T14:41:21+01:00\tمحمد. عبار\t21623636097\tقابس غنواش\ttesticalm\t179\t...',
  },
  ecomamanager: {
    id: 'ecomamanager',
    name: 'Ecomamanager',
    country: 'Algeria',
    description: 'Algeria shipping — 14 columns, phone 10 digits',
    headers: ECOMAMANAGER_HEADERS,
    placeholderText: '8478\tمحمد\t+2130549953930\t\t11 - Tamanrasset تمنراست\t\tTesticalm\t\t1\t3800\t...',
  },
  colivraison: {
    id: 'colivraison',
    name: 'Colivraison',
    country: 'Algeria',
    description: 'Algeria shipping — 17 columns, phone 10 digits',
    headers: COLIVRAISON_HEADERS,
    placeholderText: 'name\tphone\t\t\t\taddress\tproduct\t\tqty\tprice\t\t\t\tref',
  },
  ecotrack_dhd: {
    id: 'ecotrack_dhd',
    name: 'Ecotrack DHD',
    country: 'Algeria',
    description: 'Algeria shipping — 18 columns, commune selection, bundled products',
    headers: ECOTRACK_HEADERS,
    placeholderText: 'Paste confirmed leads (same format as Ecomanager/Colivraison)...',
  },
};

// ===== CONSTANTS =====
const UPSELL_TEXT = 'اشتري قطعتين و وفر';

// ===== PHONE CLEANING =====

function cleanPhoneSellmax(rawPhone: string): string {
  let phone = rawPhone.replace(/[\s\-\.]/g, '');
  if (phone.startsWith('+')) phone = phone.substring(1);
  if (phone.startsWith('216')) phone = phone.substring(3);
  if (phone.length > 8) phone = phone.slice(-8);
  return phone;
}

function cleanPhoneEcomamanager(rawPhone: string): string {
  let phone = rawPhone.replace(/[\s\-\.]/g, '');
  if (phone.startsWith('+213')) {
    phone = '0' + phone.substring(4);
  } else if (phone.startsWith('213') && phone.length > 10) {
    phone = '0' + phone.substring(3);
  }
  if (phone.length > 10) phone = phone.slice(-10);
  if (!phone.startsWith('0') && phone.length === 9) phone = '0' + phone;
  return phone;
}

// ===== PARSING =====

export function parseLeads(rawText: string, company: CompanyId): ParsedLead[] {
  if (company === 'sellmax') return parseSellmaxLeads(rawText);
  if (company === 'ecomamanager') return parseEcomamanagerLeads(rawText);
  if (company === 'colivraison') return parseColivraisonLeads(rawText);
  if (company === 'ecotrack_dhd') return parseEcotrackLeads(rawText);
  return [];
}

function parseSellmaxLeads(rawText: string): ParsedLead[] {
  const leads: ParsedLead[] = [];
  const lines = rawText.trim().split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split('\t');
    if (parts.length < 5) continue;

    const orderNumber = parts[0]?.trim() || '';
    if (orderNumber.toLowerCase().includes('order') || orderNumber.toLowerCase().includes('number')) continue;
    if (!orderNumber.startsWith('#')) continue;

    const name = parts[2]?.trim() || '';
    const rawPhone = parts[3]?.trim() || '';
    const fullAddress = parts[4]?.trim() || '';
    const productName = parts[5]?.trim() || '';
    // Column 9 (index 8): ad source / campaign name (after qty=6, price=7)
    const adSource = parts[8]?.trim() || '';

    if (!orderNumber || !rawPhone) continue;

    leads.push({
      referenceNumber: orderNumber,
      name,
      primaryPhoneNumber: cleanPhoneSellmax(rawPhone),
      fullAddress,
      rawPhone,
      productName,
      adSource,
    });
  }
  return leads;
}

/**
 * Ecomamanager parser — auto-detects format:
 * 1. Tab-separated (has \t characters)
 * 2. No tabs → unified phone-anchor parser (handles both concatenated and multi-line)
 */
function parseEcomamanagerLeads(rawText: string): ParsedLead[] {
  const hasTabs = rawText.includes('\t');
  if (hasTabs) {
    return parseEcomaTabSeparated(rawText);
  }
  return parseEcomaPhoneAnchor(rawText);
}

// ===== TAB-SEPARATED PARSER =====

function parseEcomaTabSeparated(rawText: string): ParsedLead[] {
  const leads: ParsedLead[] = [];
  const lines = rawText.trim().split('\n');

  const wilayaPattern = /^(\d{1,2}\s*-\s*.+|.+\s*-\s*\d{1,2})(\s+[\u0600-\u06FF].+)?$/;
  const phonePattern = /^\+?213\d{8,10}$|^0[5-7]\d{8}$/;
  const pricePattern = /^\d{3,5}$/;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const trimmed = lines[lineIdx].trim();
    if (!trimmed) continue;

    // Upsell continuation line
    if (trimmed.includes(UPSELL_TEXT)) {
      if (leads.length > 0) leads[leads.length - 1].originalPrice = 5800;
      continue;
    }

    // Price-only line after upsell
    const priceOnlyMatch = trimmed.match(/^(?:\d\t)?5800$/);
    if (priceOnlyMatch && leads.length > 0) {
      leads[leads.length - 1].originalPrice = 5800;
      continue;
    }

    const parts = trimmed.split('\t');
    let name = '';
    let rawPhone = '';
    let wilaya = '';
    let price = 3800;
    let phoneFound = false;

    for (let i = 0; i < parts.length; i++) {
      const val = parts[i]?.trim() || '';
      if (!phoneFound && phonePattern.test(val.replace(/[\s\-\.]/g, ''))) {
        rawPhone = val;
        phoneFound = true;
        const nameIdx = i - 1;
        if (nameIdx >= 0) {
          const possibleName = parts[nameIdx]?.trim() || '';
          if (/^\d{3,}$/.test(possibleName) && nameIdx === 0) {
            name = '';
          } else {
            name = possibleName;
          }
        }
        break;
      }
    }

    if (!phoneFound) continue;
    if (name.toLowerCase().includes('client') || name.toLowerCase().includes('name') || name.toLowerCase().includes('costumer')) continue;

    for (let i = 0; i < parts.length; i++) {
      const val = parts[i]?.trim() || '';
      if (val && wilayaPattern.test(val)) {
        wilaya = val;
        break;
      }
    }

    for (let i = parts.length - 1; i >= 0; i--) {
      const val = parts[i]?.trim() || '';
      if (pricePattern.test(val)) {
        const num = parseInt(val, 10);
        if (num >= 1000 && num <= 20000) {
          price = num;
          break;
        }
      }
    }

    leads.push({
      referenceNumber: '',
      name,
      primaryPhoneNumber: cleanPhoneEcomamanager(rawPhone),
      fullAddress: wilaya,
      rawPhone,
      originalPrice: price,
    });
  }
  return leads;
}

// ===== PHONE-ANCHOR PARSER (handles concatenated + multi-line + abandoned leads) =====

/**
 * Unified parser for non-tab data. Uses +213 phone numbers as anchors to split leads.
 * Works for:
 * - Concatenated confirmed orders (all on one line, no tabs)
 * - Multi-line abandoned leads (each field on separate lines, with junk metadata)
 * - Any mix of the above
 */
function parseEcomaPhoneAnchor(rawText: string): ParsedLead[] {
  const leads: ParsedLead[] = [];

  // Split by phone pattern, keeping the phone numbers
  const phoneRegex = /(\+213\d{9,10})/g;
  const segments = rawText.split(phoneRegex);

  const phoneCount = Math.floor((segments.length - 1) / 2);

  for (let idx = 0; idx < phoneCount; idx++) {
    const segIdx = idx * 2 + 1;
    const phone = segments[segIdx];
    const beforePhone = segments[segIdx - 1] || '';
    const afterPhone = segments[segIdx + 1] || '';

    const name = extractNameFromEnd(beforePhone);
    const { wilaya, price } = extractWilayaAndPrice(afterPhone);

    leads.push({
      referenceNumber: '',
      name,
      primaryPhoneNumber: cleanPhoneEcomamanager(phone),
      fullAddress: wilaya,
      rawPhone: phone,
      originalPrice: price,
    });
  }

  return leads;
}

/**
 * Extract the customer name from the text BEFORE the phone number.
 * Handles: clean names, names stuck to "Testicalm13800", campaign junk, empty ("-").
 */
function extractNameFromEnd(text: string): string {
  const lines = text.split('\n');

  for (let i = lines.length - 1; i >= 0; i--) {
    let line = lines[i].trim();
    if (!line) continue;

    // Skip pure junk patterns
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(line)) continue; // IP address
    if (/^\d{4}-\d{2}-\d{2}/.test(line)) continue; // ISO date
    if (/^\d{1,2}\/\d{2}\/\d{4}/.test(line)) continue; // Date format
    if (/^1?[35]800$/.test(line)) continue; // Standalone price

    // Check if line contains "testicalm" + price + name pattern
    // e.g., "Testicalm13800Benabdallah mohamed" or "testicalm 2213800كتيلة موسى"
    const testicalPriceMatch = line.match(/[Tt]esticalm(?:\s*\d{0,3}?)1?[35]800(.*)$/i);
    if (testicalPriceMatch) {
      let afterPrice = testicalPriceMatch[1].trim();
      if (!afterPrice || afterPrice === '-') return '';
      afterPrice = afterPrice.replace(/^[\-\s]+/, '').trim();
      if (!afterPrice) return '';
      // Filter out campaign junk (media buyer names, ad campaign text)
      if (/maissa|romaissa|tiktok|stif|ams\s|mix|sh\d{4}|mk\s|islam\s/i.test(afterPrice)) return '';
      // Strip trailing IP/date artifacts
      afterPrice = afterPrice.replace(/\d{4}-\d{2}-\d{2}.*$/, '').trim();
      afterPrice = afterPrice.replace(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}.*$/, '').trim();
      afterPrice = afterPrice.replace(/[\-\s]+$/, '').trim();
      return afterPrice;
    }

    // Check if line starts with a price followed by a name (e.g., "15800Yousfi")
    const priceNameMatch = line.match(/^1?[35]800\s*(.+)$/);
    if (priceNameMatch) {
      const nameCandidate = priceNameMatch[1].trim();
      if (nameCandidate === '-' || !nameCandidate) return '';
      if (/maissa|romaissa|tiktok|stif|ams\s|mix/i.test(nameCandidate)) return '';
      return nameCandidate;
    }

    // Skip campaign/ad text lines (but NOT pure Arabic names)
    if (/testicalm|tiktok|romaissa|maissa|stif|ams\s|mix|fabruary|february/i.test(line)) continue;

    // Skip wilaya patterns (from previous lead's data)
    if (/^\d{1,2}\s*-\s*[A-ZÀ-Ÿa-zà-ÿ]/.test(line)) continue;

    // If line is just "-", name is empty
    if (line === '-') return '';

    // Skip lines with IP patterns
    if (/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(line)) continue;

    // Clean leading/trailing dashes and price-like numbers
    line = line.replace(/^[\-\s]+|[\-\s]+$/g, '').trim();
    line = line.replace(/^1?[35]800\s*/, '').trim();
    if (!line) continue;

    return line;
  }

  return '';
}

/**
 * Extract wilaya and price from the text AFTER the phone number.
 * Wilaya: "XX - CityName" pattern, or "-" for empty.
 * Price: 3800 (default) or 5800 (upsell).
 */
function extractWilayaAndPrice(afterPhone: string): { wilaya: string; price: number } {
  let wilaya = '';
  let price = 3800;

  const lines = afterPhone.split('\n');
  let foundWilayaOrDash = false;

  for (let i = 0; i < lines.length && i < 8; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (!foundWilayaOrDash) {
      // Check for wilaya pattern: "XX - CityName"
      const wilayaMatch = line.match(/^(\d{1,2}\s*-\s*[A-ZÀ-Ÿa-zà-ÿ'\s]+?)(?=\s*[\u0600-\u06FF]|[Tt]esticalm|$)/);
      if (wilayaMatch) {
        wilaya = wilayaMatch[1].trim();
        foundWilayaOrDash = true;
        // Check rest of line for price
        const rest = line.substring(wilayaMatch[0].length);
        if (rest && /5800/.test(rest)) price = 5800;
        continue;
      }

      // Check for dash (no wilaya)
      if (line.startsWith('-')) {
        foundWilayaOrDash = true;
        const rest = line.substring(1).trim();
        if (rest) {
          if (/5800/.test(rest)) price = 5800;
          else if (/3800/.test(rest)) price = 3800;
        }
        continue;
      }
    }

    // Look for product/price in subsequent lines
    if (/testicalm/i.test(line)) {
      if (/5800/.test(line)) price = 5800;
      else if (/3800/.test(line)) price = 3800;
      break;
    }

    // Standalone price line
    if (/^1?[35]800$/.test(line)) {
      price = line.includes('5800') ? 5800 : 3800;
      break;
    }

    // Upsell text marker
    if (line.includes(UPSELL_TEXT)) {
      price = 5800;
    }
  }

  return { wilaya, price };
}

// ===== ROW CONVERSION =====

/**
 * Determine Sellmax SKU from product name.
 * "prostacalm" (case-insensitive) → "Prostcalm"
 * Everything else (testicalm, empty, etc.) → "TestiIcalm"
 */
function getSellmaxSku(productName?: string): string {
  if (productName && productName.toLowerCase().includes('prostacalm')) {
    return 'Prostcalm';
  }
  return 'TestiIcalm';
}

export function toSellmaxRows(leads: ParsedLead[]): SellmaxRow[] {
  return leads.map((lead) => ({
    shopName: 'SOUKTN',
    referenceNumber: lead.referenceNumber,
    name: lead.name,
    primaryPhoneNumber: lead.primaryPhoneNumber,
    fullAddress: lead.fullAddress,
    city: '',
    province: '',
    countryCode: 'TN',
    zipCode: '',
    offerValue: '87',
    offerCurrency: 'TND',
    sku: getSellmaxSku(lead.productName),
    value: '87',
    currency: 'TND',
    description: '',
    quantity: '1',
    status: 'NEW',
    offerId: '',
    creationDate: '',
    confirmationDate: '',
    offerUrl: lead.adSource || '',
    webMaster: '',
    longitude: '',
    lattitude: '',
    location: '',
    secondaryPhoneNumber: '',
    confirmationType: '',
    upsell: '',
    productLink: '',
  }));
}

export function toEcomamanagerRows(leads: ParsedLead[]): EcomamanagerRow[] {
  return leads.map((lead) => {
    const isUpsell = (lead.originalPrice || 3800) >= 5800;
    const quantity = isUpsell ? '2' : '1';
    const reduction = isUpsell ? '1800' : '';

    return {
      'Client*': lead.name || '-',
      'Téléphone*': lead.primaryPhoneNumber,
      'Téléphone 2': '',
      'Wilaya*': lead.fullAddress || '-',
      'Commune': '',
      'Adresse': '',
      'Remarque': '',
      'Produit (SKU)*': 'TES',
      'Quantité*': quantity,
      'Prix unitaire': '3800',
      'Frais de livraison': '',
      'Réduction': reduction,
      'Référent': '',
      'Stop desk': '',
    };
  });
}

// ===== COLIVRAISON =====

/**
 * Clean name for Colivraison:
 * - If name is purely digits (phone number like "675055198") → "client"
 * - If name has digits mixed in (like "mohamed055920") → remove digits → "mohamed"
 * - Otherwise keep as-is
 */
export function cleanColivraisonName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return 'client';

  // Check if name is purely digits (possibly a phone number)
  const digitsOnly = trimmed.replace(/[\s\-\+\.()]/g, '');
  if (/^\d{6,}$/.test(digitsOnly)) return 'client';

  // Remove digits from names that have letters mixed with numbers
  const cleaned = trimmed.replace(/\d+/g, '').trim();
  if (!cleaned) return 'client';

  return cleaned;
}

/**
 * Parse Colivraison leads — handles both tab-separated and concatenated formats.
 * Concatenated format: NAME+213PHONE WILAYA_CODE - WILAYA ARABIC PRODUCT QTY PRICE REFERENCE DATE IP
 * Tab-separated format: name | phone | ... | address | product | ... | price | ... | reference
 */
function parseColivraisonLeads(rawText: string): ParsedLead[] {
  const hasTabs = rawText.includes('\t');

  if (hasTabs) {
    return parseColivraisonTabSeparated(rawText);
  }
  // Concatenated format — use Colivraison-specific parser that extracts references
  return parseColivraisonConcatenated(rawText);
}

/**
 * Concatenated parser for Colivraison leads.
 * Uses +213 phone numbers as anchors to split leads.
 * Extracts: name (before phone), wilaya, price, and reference (between price and date pattern).
 */
function parseColivraisonConcatenated(rawText: string): ParsedLead[] {
  const leads: ParsedLead[] = [];

  // Split by phone pattern, keeping the phone numbers
  const phoneRegex = /(\+213\d{9,10})/g;
  const segments = rawText.split(phoneRegex);

  const phoneCount = Math.floor((segments.length - 1) / 2);

  for (let idx = 0; idx < phoneCount; idx++) {
    const segIdx = idx * 2 + 1;
    const phone = segments[segIdx];
    const beforePhone = segments[segIdx - 1] || '';
    const afterPhone = segments[segIdx + 1] || '';

    // Extract name from text before phone
    const name = extractColivraisonName(beforePhone);

    // Extract wilaya, price, and reference from text after phone
    const { wilaya, price, reference } = extractColivraisonFields(afterPhone);

    leads.push({
      referenceNumber: reference,
      name,
      primaryPhoneNumber: cleanPhoneEcomamanager(phone),
      fullAddress: wilaya,
      rawPhone: phone,
      originalPrice: price,
    });
  }

  return leads;
}

/**
 * Extract customer name from text before the phone number in concatenated format.
 * Handles: names stuck after IP/date/price/campaign junk from previous lead.
 */
function extractColivraisonName(text: string): string {
  const lines = text.split('\n');

  for (let i = lines.length - 1; i >= 0; i--) {
    let line = lines[i].trim();
    if (!line) continue;

    // Skip pure junk patterns
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(line)) continue;
    if (/^\d{4}-\d{2}-\d{2}/.test(line)) continue;
    if (/^1?[35]800$/.test(line)) continue;

    // If line ends with IP + possibly name after it, extract the name after IP
    const ipTailMatch = line.match(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\s*(.*)$/);
    if (ipTailMatch) {
      const afterIp = ipTailMatch[1].trim();
      if (afterIp && !/^\d+$/.test(afterIp)) return afterIp;
      continue;
    }

    // If line has date+time+IP pattern with name after
    const dateTailMatch = line.match(/\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}:\d{2}\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(.*)$/);
    if (dateTailMatch) {
      const afterDateIp = dateTailMatch[1].trim();
      if (afterDateIp && !/^\d+$/.test(afterDateIp)) return afterDateIp;
      continue;
    }

    // Skip campaign/ad text lines
    if (/testicalm|tiktok|romaissa|maissa|stif|ams\s|mix|fabruary|february|upsell/i.test(line)) continue;

    // Skip wilaya patterns
    if (/^\d{1,2}\s*-\s*[A-ZÀ-Ÿa-zà-ÿ]/.test(line)) continue;

    // Clean leading/trailing dashes and price-like numbers
    line = line.replace(/^[\-\s]+|[\-\s]+$/g, '').trim();
    line = line.replace(/^1?[35]800\s*/, '').trim();
    if (!line) continue;
    if (line === '-') return '';

    return line;
  }

  return '';
}

/**
 * Extract wilaya, price, and reference from text after the phone number.
 * Format: "XX - CityName ArabicName Product QTY PRICE REFERENCE DATE TIME IP"
 */
function extractColivraisonFields(afterPhone: string): { wilaya: string; price: number; reference: string } {
  let wilaya = '';
  let price = 3800;
  let reference = '';

  // Join all lines for the concatenated block
  const fullText = afterPhone;
  const lines = fullText.split('\n');

  // Check for upsell marker in any line
  const hasUpsell = lines.some(l => l.includes(UPSELL_TEXT));
  if (hasUpsell) price = 5800;

  // Work with the first line (main data line for this lead)
  const firstLine = lines[0] || '';

  // Extract wilaya: "XX - CityName ArabicName"
  const wilayaMatch = firstLine.match(/^(\d{1,2}\s*-\s*[A-ZÀ-Ÿa-zà-ÿ'\s]+?)(?=\s*[\u0600-\u06FF]|[Tt]esticalm|$)/);
  let afterWilaya = firstLine;
  if (wilayaMatch) {
    // Include Arabic part of wilaya name
    const afterLatin = firstLine.substring(wilayaMatch[0].length);
    const arabicPart = afterLatin.match(/^\s*([\u0600-\u06FF\s]+?)(?=[Tt]esticalm|[A-Za-z]|$)/);
    if (arabicPart) {
      wilaya = (wilayaMatch[1] + ' ' + arabicPart[1]).trim();
      afterWilaya = afterLatin.substring(arabicPart[0].length);
    } else {
      wilaya = wilayaMatch[1].trim();
      afterWilaya = afterLatin;
    }
  }

  // Extract product + qty + price: "Testicalm 22" or "testicalm" followed by QTY PRICE
  // Product pattern: testicalm (possibly with extra text like " علاج دوالي الخصية" or " 22")
  const productMatch = afterWilaya.match(/[Tt][Ee][Ss][Tt][Ii][Cc][Aa][Ll][Mm](?:[^\d]*?)?(\d)(\d{4})/);
  if (productMatch) {
    const qty = parseInt(productMatch[1], 10);
    const parsedPrice = parseInt(productMatch[2], 10);
    if (parsedPrice === 3800 || parsedPrice === 5800) {
      price = hasUpsell ? 5800 : parsedPrice;
    }
    const afterPrice = afterWilaya.substring(afterWilaya.indexOf(productMatch[0]) + productMatch[0].length);

    // Reference: everything between price and date pattern (YYYY-MM-DD)
    const dateMatch = afterPrice.match(/\d{4}-\d{2}-\d{2}/);
    if (dateMatch && dateMatch.index !== undefined) {
      reference = afterPrice.substring(0, dateMatch.index).trim();
    } else {
      // No date found — reference might be on a subsequent line
      reference = afterPrice.trim();
    }
  } else {
    // Try to find price without product name (e.g., on next lines for upsell)
    for (const line of lines) {
      const priceMatch = line.match(/(\d)(\d{4})(?=[a-zA-Z\u0600-\u06FF])/);
      if (priceMatch) {
        const parsedPrice = parseInt(priceMatch[2], 10);
        if (parsedPrice === 3800 || parsedPrice === 5800) {
          price = hasUpsell ? 5800 : parsedPrice;
          const afterP = line.substring(line.indexOf(priceMatch[0]) + priceMatch[0].length);
          const dateM = afterP.match(/\d{4}-\d{2}-\d{2}/);
          if (dateM && dateM.index !== undefined) {
            reference = afterP.substring(0, dateM.index).trim();
          }
        }
        break;
      }
    }
  }

  // For upsell leads, reference might be on a line after the upsell text and price
  if (hasUpsell && !reference) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      // Look for line starting with price pattern followed by reference
      const upsellPriceRef = line.match(/^1?5800(.+)/);
      if (upsellPriceRef) {
        const afterUpsellPrice = upsellPriceRef[1].trim();
        const dateM = afterUpsellPrice.match(/\d{4}-\d{2}-\d{2}/);
        if (dateM && dateM.index !== undefined) {
          reference = afterUpsellPrice.substring(0, dateM.index).trim();
        } else {
          reference = afterUpsellPrice;
        }
        break;
      }
    }
  }

  // Clean reference: remove trailing "testicalmupsell" or similar junk
  reference = reference.replace(/\s*testicalm\s*upsell\s*$/i, '').trim();
  // Remove leading digits that leaked from product/price parsing (e.g. "00maissa-FB-...")
  reference = reference.replace(/^\d{1,3}(?=[a-zA-Z])/, '').trim();
  // Remove trailing IP addresses
  reference = reference.replace(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}.*$/, '').trim();
  // Remove trailing date patterns
  reference = reference.replace(/\d{4}-\d{2}-\d{2}.*$/, '').trim();

  return { wilaya, price, reference };
}

/**
 * Tab-separated parser for Colivraison leads.
 * 
 * Fixed column layout from Shopify confirmation sheets:
 *   A(0)=Name  B(1)=Phone  C-E(2-4)=empty  F(5)=Wilaya  G(6)=Product
 *   H(7)=empty  I(8)=Qty  J(9)=Price  K-M(10-12)=empty  N(13)=Reference
 *   O(14)=Date  P(15)=IP
 * 
 * For upsell leads, column N may contain "testicalmupsell" on a second line — we strip that.
 * Phone column is auto-detected (in case of order number prefix shifting columns).
 */
function parseColivraisonTabSeparated(rawText: string): ParsedLead[] {
  const leads: ParsedLead[] = [];

  const phonePattern = /^\+?213\d{8,10}$|^0[5-7]\d{8}$/;
  const pricePattern = /^\d{3,5}$/;

  // Pre-process: merge multi-line rows back together.
  // When a spreadsheet cell contains newlines (e.g., upsell product text or reference with
  // "testicalmupsell" suffix), the paste splits them into separate lines.
  // A "real" row has a phone number in it. Lines without a phone are continuations of the
  // previous row — we merge them back by joining with the previous line's last tab-column.
  const rawLines = rawText.trim().split('\n');
  const mergedLines: string[] = [];
  for (const rawLine of rawLines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    // Check if this line has a phone number (= new lead row)
    const hasTabs = trimmed.includes('\t');
    const parts = trimmed.split('\t');
    let hasPhone = false;
    if (hasTabs) {
      for (const p of parts) {
        if (phonePattern.test(p.trim().replace(/[\s\-\.]/g, ''))) {
          hasPhone = true;
          break;
        }
      }
    }
    if (hasPhone) {
      // New lead row
      mergedLines.push(trimmed);
    } else if (mergedLines.length > 0) {
      // Continuation line — append to previous row
      // This handles upsell text in product column, "1" in qty column, etc.
      // Mark as upsell if it contains the upsell text
      mergedLines[mergedLines.length - 1] += '\n' + trimmed;
    }
  }

  for (let lineIdx = 0; lineIdx < mergedLines.length; lineIdx++) {
    const fullLine = mergedLines[lineIdx];
    // Check for upsell markers anywhere in the merged line
    const isUpsell = fullLine.includes(UPSELL_TEXT) || /\b5800\b/.test(fullLine);

    // Flatten all tab-columns across all sub-lines into one array.
    // When a spreadsheet cell has newlines, the paste breaks the row into multiple lines,
    // but the tab columns continue across lines. E.g. for an upsell lead:
    //   Line 0: name\tphone\t\t\t\twilaya\tTesticalm          (cols 0-6)
    //   Line 1: upsellText\t\t1                                  (cols 7-9, continuation)
    //   Line 2: 1\t5800\t\t\t\treference                       (cols 10-15)
    //   Line 3: testicalmupsell\tdate\tIP                        (cols 16-18)
    // We join them all into one flat parts array.
    const subLines = fullLine.split('\n');
    const parts: string[] = [];
    for (const sub of subLines) {
      const subParts = sub.split('\t');
      for (const sp of subParts) {
        parts.push(sp);
      }
    }
    if (parts.length === 0) continue;
    let name = '';
    let rawPhone = '';
    let address = '';
    let price = 3800;
    let reference = '';
    let phoneFound = false;
    let phoneIdx = -1;

    // Find phone column (usually index 1, but auto-detect to be safe)
    for (let i = 0; i < parts.length; i++) {
      const val = parts[i]?.trim() || '';
      if (!phoneFound && phonePattern.test(val.replace(/[\s\-\.]/g, ''))) {
        rawPhone = val;
        phoneFound = true;
        phoneIdx = i;
        break;
      }
    }

    if (!phoneFound) continue;

    // Name is the column before phone
    if (phoneIdx > 0) {
      const possibleName = parts[phoneIdx - 1]?.trim() || '';
      if (!/^(name|client|costumer|\d{4,})$/i.test(possibleName)) {
        name = possibleName;
      }
    }

    // Skip header rows
    if (name.toLowerCase().includes('name') || name.toLowerCase().includes('client*')) continue;

    // Address/Wilaya: look for "XX - CityName" pattern after phone
    const wilayaPattern = /^(\d{1,2}\s*-\s*.+|.+\s*-\s*\d{1,2})(\s+[\u0600-\u06FF].+)?$/;
    for (let i = phoneIdx + 1; i < parts.length; i++) {
      const val = parts[i]?.trim() || '';
      if (val && wilayaPattern.test(val)) {
        address = val;
        break;
      }
    }

    // Price: scan backwards to find the price column
    let priceIdx = -1;
    for (let i = parts.length - 1; i >= 0; i--) {
      const val = parts[i]?.trim() || '';
      if (pricePattern.test(val)) {
        const num = parseInt(val, 10);
        if (num >= 1000 && num <= 20000) {
          price = num;
          priceIdx = i;
          break;
        }
      }
    }

    // Reference: scan FORWARD from price column to find the first non-empty column
    // that isn't a date, time, IP, or small number.
    // In the Shopify sheet layout, reference is in column N (index 13), right after price (index 9)
    // with 3 empty columns in between.
    if (priceIdx >= 0) {
      for (let i = priceIdx + 1; i < parts.length; i++) {
        const val = parts[i]?.trim() || '';
        if (!val) continue;
        // Skip date columns (YYYY-MM-DD or YYYY-MM-DD HH:MM:SS)
        if (/^\d{4}-\d{2}-\d{2}/.test(val)) continue;
        // Skip time columns (HH:MM:SS)
        if (/^\d{1,2}:\d{2}:\d{2}$/.test(val)) continue;
        // Skip IP address columns
        if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(val)) continue;
        // Skip small numbers (qty like 1, 2)
        if (/^\d{1,2}$/.test(val)) continue;
        // Skip "testicalmupsell" artifact from upsell cell continuation
        if (/^testicalm\s*upsell$/i.test(val)) continue;
        // Skip upsell text
        if (val.includes(UPSELL_TEXT)) continue;
        reference = val;
        break;
      }
    }

    // Clean reference: strip Google Sheets clipboard quoting and upsell artifacts.
    // When cells contain newlines, the clipboard wraps them in double quotes:
    //   "romaissa-TT-5720-Testicalm AMS 15-02-26\ntesticalmupsell"
    // We strip: leading/trailing quotes, the "testicalmupsell" suffix (one word), and any newline junk.
    reference = reference.replace(/^"+/, '').replace(/"+$/, '');  // strip surrounding quotes
    reference = reference.replace(/\n.*testicalm.*upsell.*/i, '').trim();
    reference = reference.replace(/\s*testicalmupsell\s*$/i, '').trim();
    reference = reference.split('\n')[0].trim();  // keep only first line, strip anything after newline

    // Override price for upsell leads detected from merged continuation lines
    if (isUpsell && price < 5800) {
      price = 5800;
    }

    leads.push({
      referenceNumber: reference,
      name,
      primaryPhoneNumber: cleanPhoneEcomamanager(rawPhone),
      fullAddress: address,
      rawPhone,
      originalPrice: price,
    });
  }
  return leads;
}

/**
 * Convert parsed leads to Colivraison rows.
 * @param leads - Parsed leads
 * @param product - Selected product config (determines Produit label and price→qty rules)
 */
export function toColivraisonRows(leads: ParsedLead[], product: ColivraisonProductConfig): ColivraisonRow[] {
  return leads.map((lead) => {
    const price = lead.originalPrice || 3800;
    // Find matching qty from price rules, default to 1
    const matchedRule = product.priceRules.find(r => r.price === price);
    const qty = matchedRule ? matchedRule.qty : 1;

    return {
      Nom: cleanColivraisonName(lead.name),
      Tel1: lead.primaryPhoneNumber,
      Tel2: '',
      Adresse: lead.fullAddress || '',
      Commune: '.',
      Wilaya: '.',
      Produit: product.productLabel,
      Variant: '',
      Qte: String(qty),
      Prix: String(price),
      Remarque: '',
      Ref: lead.referenceNumber || '',
      Fragile: '',
      Testable: '',
      SKU: '',
      Weight: '',
      Exchange: '',
    };
  });
}

// ===== ECOTRACK DHD =====

import { extractWilayaCode, getWilayaName, findWilayaCodeFromArabic } from './ecotrackData';

/**
 * Ecotrack DHD parser — auto-detects format:
 * 1. Tab-separated (has \t characters) → fixed column parser:
 *    Col A(0)=Date, B(1)=Status, C(2)=Qty, D(3)=Uploaded, E(4)=Comments,
 *    F(5)=AgentCode, G(6)=ProductName, H(7)=ClientName, I(8)=Phone,
 *    J(9)=FullAddress(wilaya), K(10)=empty, L(11)=Price, M(12)=ADS_SKU
 * 2. Has sh\d{2} phone pattern (concatenated) → sh08 phone anchor parser
 * 3. Has +213 phone pattern → reuse Ecomamanager phone anchor parser
 * 4. Fallback → Ecomamanager parser
 */
function parseEcotrackLeads(rawText: string): ParsedLead[] {
  const hasTabs = rawText.includes('\t');
  if (hasTabs) {
    return parseEcotrackFixedColumns(rawText);
  }
  // Check for sh-prefixed phone pattern (e.g., sh080555821012)
  const hasShPhone = /sh\d{2}0[5-7]\d{8}/i.test(rawText);
  if (hasShPhone) {
    return parseEcotrackShPhoneAnchor(rawText);
  }
  // Check for +213 phone pattern
  const has213Phone = /\+213\d{9,10}/.test(rawText);
  if (has213Phone) {
    return parseEcomaPhoneAnchor(rawText);
  }
  // Fallback to Ecomamanager parser
  return parseEcomamanagerLeads(rawText);
}

/**
 * Fixed-column parser for Ecotrack DHD — Google Sheets paste (tab-separated).
 * Simple column reads — no product name parsing needed:
 *   H(7) = Client Name
 *   I(8) = Phone
 *   J(9) = Full Address / Wilaya
 *   L(11) = Price (copy as-is)
 *   C(2) = Qty (>1 = upsell, stored in ParsedLead for toEcotrackRows)
 */
function parseEcotrackFixedColumns(rawText: string): ParsedLead[] {
  const leads: ParsedLead[] = [];
  const lines = rawText.trim().split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const parts = trimmed.split('\t');
    // Need at least 10 columns to be a valid lead row
    if (parts.length < 10) continue;

    // Column I (index 8) = Phone — must be a valid Algerian phone
    let rawPhone = (parts[8] || '').trim().replace(/[\s\-\.\'\u2018\u2019]/g, '');
    if (!rawPhone) continue;
    // Normalize: 9-digit phones starting with [5-7] → prepend 0
    if (/^[5-7]\d{8}$/.test(rawPhone)) rawPhone = '0' + rawPhone;
    // Accept 0[5-7]XXXXXXXX or +213... or 213...
    if (!/^(?:\+?213\d{8,10}|0[5-7]\d{8})$/.test(rawPhone)) continue;

    // Column H (index 7) = Client name
    const name = (parts[7] || '').trim();
    // Skip header rows only — do NOT skip "SM1 client" or "client CODE" which are real leads
    if (/^(name|costumer|client name|nom)$/i.test(name)) continue;

    // Column J (index 9) = Full address / wilaya
    const fullAddress = (parts[9] || '').trim();

    // Column L (index 11) = Price — just copy as-is
    const rawPrice = (parts[11] || '').trim();
    const price = rawPrice ? parseInt(rawPrice, 10) : 3800;
    const finalPrice = (price && !isNaN(price) && price >= 1000) ? price : 3800;

    // Column C (index 2) = Qty — used for upsell detection in toEcotrackRows
    const rawQty = (parts[2] || '').trim();
    const qty = rawQty ? parseFloat(rawQty) : 1;

    leads.push({
      referenceNumber: '',
      name,
      primaryPhoneNumber: cleanPhoneEcomamanager(rawPhone),
      fullAddress,
      rawPhone,
      originalPrice: finalPrice,
      // Store qty in productName field as a workaround ("qty:2" format)
      productName: qty > 1 ? `qty:${Math.round(qty)}` : undefined,
    });
  }

  return leads;
}

/**
 * Parse concatenated Ecotrack leads using sh-prefixed phone numbers as anchors.
 * 
 * Format per lead (2 lines):
 *   Line 1: DD/MM/YYYYتأكيد1نعمSH08TESTICALM [upsell text]NAME sh08PHONE_10DIGWILAYA - Name Arabic - Commune PRICE
 *   Line 2: campaign/source text (skipped)
 * 
 * Phone pattern: sh\d{2}(0[5-7]\d{8}) — prefix + 10-digit Algerian mobile
 * After phone: wilaya code + " - " + name + Arabic + commune + price
 * Upsell: detected by "اشتري قطعتين و وفر" text before phone
 */
function parseEcotrackShPhoneAnchor(rawText: string): ParsedLead[] {
  const leads: ParsedLead[] = [];
  const lines = rawText.trim().split('\n');
  const shPhoneRegex = /sh\d{2}(0[5-7]\d{8})/i;
  const upsellMarker = '\u0627\u0634\u062a\u0631\u064a \u0642\u0637\u0639\u062a\u064a\u0646 \u0648 \u0648\u0641\u0631'; // اشتري قطعتين و وفر

  for (const line of lines) {
    const phoneMatch = shPhoneRegex.exec(line);
    if (!phoneMatch) continue; // Skip campaign/source lines

    const phone = phoneMatch[1];
    const beforePhone = line.substring(0, phoneMatch.index);
    const afterPhone = line.substring(phoneMatch.index + phoneMatch[0].length);

    // Detect upsell from text before phone
    const isUpsell = beforePhone.includes(upsellMarker);

    // Extract name: text between TESTICALM [+ upsell text + price text] and the sh08 prefix
    const nameMatch = beforePhone.match(
      /TESTICALM(?:\s*\u0627\u0634\u062a\u0631\u064a \u0642\u0637\u0639\u062a\u064a\u0646 \u0648 \u0648\u0641\u0631\s*\d+\s*\u062f\u064a\u0646\u0627\u0631)?(.+?)$/i
    );
    let name = nameMatch ? nameMatch[1].trim() : '';
    // Clean: remove leading/trailing spaces and dashes
    name = name.replace(/^[\-\s]+|[\-\s]+$/g, '').trim();

    // Extract price (last 4-5 digit number at end of afterPhone)
    const priceMatch = afterPhone.match(/(\d{4,5})\s*$/);
    const price = priceMatch ? parseInt(priceMatch[1], 10) : (isUpsell ? 5800 : 3800);

    // Extract wilaya text (everything between phone and price)
    let wilayaText = priceMatch
      ? afterPhone.substring(0, priceMatch.index).trim()
      : afterPhone.trim();

    // Normalize wilaya: ensure "XX - Name" format
    const wilayaCodeMatch = wilayaText.match(/^(\d{1,2})\s*-\s*/);
    if (wilayaCodeMatch) {
      const code = parseInt(wilayaCodeMatch[1], 10);
      const rest = wilayaText.substring(wilayaCodeMatch[0].length);
      wilayaText = `${code} - ${rest}`.trim();
    } else {
      // No numeric code — try Arabic name lookup
      const cleanedText = wilayaText.replace(/^[\-\s]+/, '').trim();
      const arabicCode = findWilayaCodeFromArabic(cleanedText);
      if (arabicCode) {
        wilayaText = `${arabicCode} - ${cleanedText}`;
      } else {
        wilayaText = cleanedText;
      }
    }

    leads.push({
      referenceNumber: '',
      name,
      primaryPhoneNumber: cleanPhoneEcomamanager(phone),
      fullAddress: wilayaText,
      rawPhone: phone,
      originalPrice: price,
    });
  }

  return leads;
}

/**
 * Convert parsed leads to Ecotrack DHD rows.
 * 
 * Product logic (Testicalm+ Savon bundle):
 * - Normal order (3800): produit = "TES,SAV", quantité = "1,1" (1 testicalm + 1 savon)
 * - Upsell order (5800): produit = "TES,SAV", quantité = "2,1" (2 testicalm + 1 savon — always 1 savon)
 * 
 * Commune is set from the communeMap parameter (user-selected per lead).
 * Wilaya code and name are auto-extracted from the lead's fullAddress.
 */
export function toEcotrackRows(
  leads: ParsedLead[],
  communeMap: Record<number, string>, // leadIndex → selected commune
  wilayaOverrides?: Record<number, number>, // leadIndex → manually selected wilaya code
): EcotrackRow[] {
  return leads.map((lead, idx) => {
    // Upsell detection: check qty stored in productName ("qty:2") from fixed-column parser,
    // OR fall back to price >= 5800 for sh08/concatenated parser leads
    const qtyFromProduct = lead.productName?.startsWith('qty:') ? parseInt(lead.productName.split(':')[1], 10) : 0;
    const isUpsell = qtyFromProduct > 1 || (lead.originalPrice || 3800) >= 5800;
    const detectedWilaya = extractWilayaCode(lead.fullAddress || '');
    const wilayaCode = wilayaOverrides?.[idx] != null ? wilayaOverrides[idx] : detectedWilaya;
    const wilayaName = wilayaCode ? getWilayaName(wilayaCode) : '';
    const selectedCommune = communeMap[idx] || '';
    const price = lead.originalPrice || 3800;

    return {
      'reference commande': '',
      'nom et prenom du destinataire*': lead.name || '-',
      'telephone*': lead.primaryPhoneNumber,
      'telephone 2': '',
      'code wilaya*': wilayaCode ? String(wilayaCode) : '',
      'wilaya de livraison': wilayaName,
      'commune de livraison*': selectedCommune,
      'adresse de livraison*': lead.fullAddress || '',
      'produit (référence)*': 'TES,SAV',
      'quantité*': isUpsell ? '2,1' : '1,1',
      'poids (kg)': '',
      'montant du colis*': String(price),
      'remarque': '',
      'FRAGILE': '',
      'ESSAYAGE PERMI': '',
      'ECHANGE': '',
      'STOP DESK': '',
      'Lien map': '',
    };
  });
}
