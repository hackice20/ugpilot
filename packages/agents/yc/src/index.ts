export type {
  YcCompanyHit,
  YcCompanyScraped,
  YcProfileInput,
  YcOutreachPromptInput,
} from "./types.js";
export { findYcCompanies } from "./find-companies.js";
export { scrapeYcCompanies } from "./scrape-companies.js";
export { buildYcOutreachPrompt, RESUME_FACTS } from "./outreach-prompt.js";
