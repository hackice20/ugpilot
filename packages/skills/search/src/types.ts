export type SearchResult = {
  title: string;
  url: string;
  content: string;
  engine?: string;
};

export type SearchResponse = {
  query: string;
  results: SearchResult[];
  latencyMs: number;
};

export type SearxngJson = {
  query?: string;
  results?: Array<{
    title?: string;
    url?: string;
    content?: string;
    engine?: string;
  }>;
};
