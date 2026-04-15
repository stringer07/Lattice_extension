import { Clipboard, showToast, Toast } from "@raycast/api";

// Export format types for Word-compatible reference managers
export type ExportFormat = "bibtex" | "ris" | "endnote" | "apa" | "mla" | "chicago";

export interface FormatOption {
  id: ExportFormat;
  title: string;
  description: string;
}

export const EXPORT_FORMATS: FormatOption[] = [
  { id: "bibtex", title: "BibTeX", description: "LaTeX/BibTeX format" },
  { id: "ris", title: "RIS", description: "Research Information Systems format" },
  { id: "endnote", title: "EndNote", description: "EndNote tagged format" },
  { id: "apa", title: "APA", description: "APA 7th edition citation" },
  { id: "mla", title: "MLA", description: "MLA 9th edition citation" },
  { id: "chicago", title: "Chicago", description: "Chicago 17th edition citation" },
];

// Paper interface matching the API response
export interface Paper {
  id: string;
  citekey: string;
  title: string;
  authors: string[];
  year: number;
  journal: string;
  doi: string;
  volume: string;
  issue: string;
  pages: string;
  isbn: string;
  paperType: string;
  cslItem: Record<string, unknown>;
}

function getBibTeXEntryType(paperType: string): string {
  switch (paperType.toLowerCase()) {
    case "book":
      return "book";
    case "article":
      return "article";
    case "inproceedings":
      return "inproceedings";
    case "thesis":
      return "phdthesis";
    case "report":
      return "techreport";
    case "misc":
      return "misc";
    default:
      return "misc";
  }
}

// Convert a Paper to BibTeX string
export function formatBibTeX(paper: Paper): string {
  const entryType = getBibTeXEntryType(paper.paperType);
  const citekey = paper.citekey || "unknown";

  const fields: [string, string | undefined][] = [
    ["title", paper.title],
    ["author", paper.authors?.join(" and ")],
    ["year", paper.year ? String(paper.year) : undefined],
    ["journal", paper.journal],
    ["volume", paper.volume],
    ["number", paper.issue],
    ["pages", paper.pages],
    ["doi", paper.doi],
    ["isbn", paper.isbn],
  ];

  const body = fields
    .filter(([, v]) => v)
    .map(([k, v]) => `  ${k} = {${v}}`)
    .join(",\n");

  return `@${entryType}{${citekey},\n${body}\n}`;
}

// Convert a Paper to RIS format
export function formatRIS(paper: Paper): string {
  const typeMap: Record<string, string> = {
    article: "JOUR",
    book: "BOOK",
    inproceedings: "CONF",
    thesis: "THES",
    report: "RPRT",
    misc: "GEN",
  };

  const lines: string[] = [];
  lines.push(`TY  - ${typeMap[paper.paperType.toLowerCase()] || "GEN"}`);
  lines.push(`TI  - ${paper.title}`);

  paper.authors?.forEach((author) => {
    lines.push(`AU  - ${author}`);
  });

  if (paper.year) lines.push(`PY  - ${paper.year}`);
  if (paper.journal) lines.push(`JO  - ${paper.journal}`);
  if (paper.volume) lines.push(`VL  - ${paper.volume}`);
  if (paper.issue) lines.push(`IS  - ${paper.issue}`);
  if (paper.pages) lines.push(`SP  - ${paper.pages}`);
  if (paper.doi) lines.push(`DO  - ${paper.doi}`);
  if (paper.isbn) lines.push(`SN  - ${paper.isbn}`);
  lines.push("ER  - ");

  return lines.join("\n");
}

// Convert a Paper to EndNote format
export function formatEndNote(paper: Paper): string {
  const typeMap: Record<string, string> = {
    article: "Journal Article",
    book: "Book",
    inproceedings: "Conference Paper",
    thesis: "Thesis",
    report: "Report",
    misc: "Generic",
  };

  const lines: string[] = [];
  lines.push(`%0 ${typeMap[paper.paperType.toLowerCase()] || "Generic"}`);
  lines.push(`%T ${paper.title}`);

  paper.authors?.forEach((author) => {
    lines.push(`%A ${author}`);
  });

  if (paper.year) lines.push(`%D ${paper.year}`);
  if (paper.journal) lines.push(`%J ${paper.journal}`);
  if (paper.volume) lines.push(`%V ${paper.volume}`);
  if (paper.issue) lines.push(`%N ${paper.issue}`);
  if (paper.pages) lines.push(`%P ${paper.pages}`);
  if (paper.doi) lines.push(`%R ${paper.doi}`);
  if (paper.isbn) lines.push(`%@ ${paper.isbn}`);

  return lines.join("\n");
}

// Format author names for citations
function formatAuthors(authors: string[], maxAuthors: number = 3): string {
  if (!authors || authors.length === 0) return "Unknown";
  if (authors.length === 1) return authors[0];
  if (authors.length === 2) return `${authors[0]} and ${authors[1]}`;
  if (authors.length <= maxAuthors) {
    const last = authors[authors.length - 1];
    const rest = authors.slice(0, -1).join(", ");
    return `${rest}, and ${last}`;
  }
  return `${authors[0]} et al.`;
}

// APA 7th edition format
export function formatAPA(paper: Paper): string {
  const authors = formatAuthors(paper.authors, 20);
  const year = paper.year || "n.d.";
  const title = paper.title;
  const journal = paper.journal;
  const volume = paper.volume;
  const issue = paper.issue;
  const pages = paper.pages;
  const doi = paper.doi;

  let citation = `${authors} (${year}). ${title}`;

  if (journal) {
    citation += `. *${journal}*`;
    if (volume) {
      citation += `, *${volume}*`;
      if (issue) citation += `(${issue})`;
    }
    if (pages) citation += `, ${pages}`;
    citation += ".";
  } else {
    citation += ".";
  }

  if (doi) citation += ` https://doi.org/${doi}`;

  return citation;
}

// MLA 9th edition format
export function formatMLA(paper: Paper): string {
  const authors = formatAuthors(paper.authors, 2);
  const title = `"${paper.title}."`;
  const journal = paper.journal;
  const volume = paper.volume;
  const issue = paper.issue;
  const year = paper.year || "n.d.";
  const pages = paper.pages;

  let citation = `${authors}. ${title}`;

  if (journal) {
    citation += ` *${journal}*`;
    if (volume) {
      citation += `, vol. ${volume}`;
      if (issue) citation += `, no. ${issue}`;
    }
    citation += `, ${year}`;
    if (pages) citation += `, pp. ${pages}`;
    citation += ".";
  } else {
    citation += ` ${year}.`;
  }

  if (paper.doi) citation += ` DOI:${paper.doi}.`;

  return citation;
}

// Chicago 17th edition (Notes and Bibliography) format
export function formatChicago(paper: Paper): string {
  const authors = formatAuthors(paper.authors, 3);
  const title = paper.title;
  const journal = paper.journal;
  const volume = paper.volume;
  const issue = paper.issue;
  const year = paper.year || "n.d.";
  const pages = paper.pages;

  let citation = `${authors}. "${title}."`;

  if (journal) {
    citation += ` *${journal}*`;
    if (volume) {
      citation += ` ${volume}`;
      if (issue) citation += `, no. ${issue}`;
    }
    citation += ` (${year})`;
    if (pages) citation += `: ${pages}`;
    citation += ".";
  } else {
    citation += ` ${year}.`;
  }

  if (paper.doi) citation += ` https://doi.org/${paper.doi}.`;

  return citation;
}

// Main export function that formats paper based on selected format
export function formatPaper(paper: Paper, format: ExportFormat): string {
  switch (format) {
    case "bibtex":
      return formatBibTeX(paper);
    case "ris":
      return formatRIS(paper);
    case "endnote":
      return formatEndNote(paper);
    case "apa":
      return formatAPA(paper);
    case "mla":
      return formatMLA(paper);
    case "chicago":
      return formatChicago(paper);
    default:
      return formatBibTeX(paper);
  }
}

// Copy formatted paper to clipboard
export async function copyFormattedPaper(paper: Paper, format: ExportFormat): Promise<void> {
  const toast = await showToast({
    style: Toast.Style.Animated,
    title: `Copying ${EXPORT_FORMATS.find((f) => f.id === format)?.title}…`,
  });

  try {
    const content = formatPaper(paper, format);
    await Clipboard.copy(content);
    toast.style = Toast.Style.Success;
    toast.title = `${EXPORT_FORMATS.find((f) => f.id === format)?.title} copied`;
  } catch (e) {
    toast.style = Toast.Style.Failure;
    toast.title = "Failed to copy";
    toast.message = e instanceof Error ? e.message : String(e);
  }
}

// Fetch paper and copy in selected format
export async function fetchAndCopyFormatted(baseUrl: string, paperId: string, format: ExportFormat): Promise<void> {
  const toast = await showToast({
    style: Toast.Style.Animated,
    title: `Fetching paper…`,
  });

  try {
    const res = await fetch(`${baseUrl}/papers/${paperId}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const paper: Paper = await res.json();

    const content = formatPaper(paper, format);
    await Clipboard.copy(content);

    toast.style = Toast.Style.Success;
    toast.title = `${EXPORT_FORMATS.find((f) => f.id === format)?.title} copied`;
  } catch (e) {
    toast.style = Toast.Style.Failure;
    toast.title = "Failed to copy";
    toast.message = e instanceof Error ? e.message : String(e);
  }
}
