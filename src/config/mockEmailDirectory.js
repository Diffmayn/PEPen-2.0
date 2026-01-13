export const MOCK_EMAILS = [
  'rene@example.dk',
  'colleague1@company.dk',
  'colleague2@company.dk',
  'anne.hansen@company.dk',
  'mikkel.nielsen@company.dk',
  'søren@company.dk',
  'jørgen@company.dk',
  'line.pedersen@company.dk',
  'marketing.team@company.dk',
  'qa.proof@company.dk',
];

export const COMPANY_EMAIL_DOMAINS = ['company.dk', 'example.dk'];

export function isCompanyEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  const at = e.lastIndexOf('@');
  if (at < 0) return false;
  const domain = e.slice(at + 1);
  return COMPANY_EMAIL_DOMAINS.includes(domain);
}

export function isKnownMockEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  return MOCK_EMAILS.map((x) => x.toLowerCase()).includes(e);
}
