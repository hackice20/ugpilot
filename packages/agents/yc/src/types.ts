export type YcCompanyHit = {
  name: string;
  url: string;
  blurb: string;
};

export type YcProfileInput = {
  displayName?: string | null;
  targetRole?: string | null;
  resumeBlurb?: string | null;
};

export type YcOutreachPromptInput = {
  companyQuery: string;
  searchRaw: string;
  profile: YcProfileInput;
};
