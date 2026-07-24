export type YcCompanyHit = {
  name: string;
  url: string;
  blurb: string;
};

export type YcCompanyScraped = YcCompanyHit & {
  scrapeUrl: string;
  scrapedText: string;
};

export type YcProfileInput = {
  displayName?: string | null;
  targetRole?: string | null;
  resumeBlurb?: string | null;
  /** Full resume text from an attached PDF/DOCX, if any. */
  resumeAttached?: string | null;
};

export type YcOutreachPromptInput = {
  companyQuery: string;
  companies: YcCompanyScraped[];
  profile: YcProfileInput;
};
