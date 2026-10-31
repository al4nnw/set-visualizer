/**
 * Who sells REKCUT, for the terms, refund and privacy pages (and the pricing page's footnote).
 * Pages use these as `%legal.<field>%`; scripts/landingPages.ts fills them in every language.
 * An empty field shows as a highlighted placeholder on the page, so fill every one before the
 * pages go live (Paddle's site review asks for the seller's legal name in the terms).
 */
/** Details that may stay empty: the page then leaves them out instead of showing a placeholder. */
export const OPTIONAL_LEGAL = ['taxId', 'address']

export const LEGAL = {
  /** The seller's legal name: the company, or the sole proprietor's full name. */
  name: '',
  /**
   * Optional: a CNPJ, if the business has one. Paddle doesn't ask for it (it is the Merchant of
   * Record), so leave it empty rather than publish a personal CPF.
   */
  taxId: '',
  /** Optional: a postal address for legal notices. Paddle doesn't ask for it either. */
  address: '',
  /** Where customers write for support, refunds and privacy requests. */
  email: '',
  /** Days after a payment within which it is refunded on request, no questions asked. */
  refundDays: '14',
  /** When the terms, refund and privacy pages last changed (YYYY-MM-DD). */
  updated: '2026-10-31'
}
