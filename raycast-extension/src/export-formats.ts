import { Clipboard, getPreferenceValues, showToast, Toast } from "@raycast/api";
import { Cite } from "@citation-js/core";
import "@citation-js/plugin-bibtex";
import "@citation-js/plugin-ris";

// Export format types for Word-compatible reference managers
export type ExportFormat = "bibtex" | "ris" | "endnote" | "apa" | "mla" | "chicago" | "csl-json";

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
  { id: "csl-json", title: "CSL-JSON", description: "Citation Style Language JSON" },
];

const exportFormatTitles: Record<ExportFormat, string> = Object.fromEntries(
  EXPORT_FORMATS.map((format) => [format.id, format.title]),
) as Record<ExportFormat, string>;

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

// CSL-JSON type mapping
const typeMap: Record<string, string> = {
  article: "article-journal",
  book: "book",
  inproceedings: "paper-conference",
  thesis: "thesis",
  report: "report",
  misc: "document",
  webpage: "webpage",
  software: "software",
  dataset: "dataset",
  patent: "patent",
};

// Parse author string "First Last" into CSL name object
function parseAuthor(author: string): { given: string; family: string } {
  const parts = author.trim().split(/\s+/);
  if (parts.length === 1) {
    return { family: parts[0], given: "" };
  }
  const family = parts[parts.length - 1];
  const given = parts.slice(0, -1).join(" ");
  return { family, given };
}

// Convert Paper to CSL-JSON format
function paperToCSL(paper: Paper): Record<string, unknown> {
  // If the API already provides a CSL item, use it as base
  if (paper.cslItem && Object.keys(paper.cslItem).length > 0) {
    return {
      id: paper.id,
      ...paper.cslItem,
    };
  }

  // Otherwise, construct CSL-JSON from Paper fields
  const cslType = typeMap[paper.paperType?.toLowerCase()] || "document";

  const csl: Record<string, unknown> = {
    id: paper.citekey || paper.id,
    type: cslType,
    title: paper.title,
  };

  if (paper.authors && paper.authors.length > 0) {
    csl.author = paper.authors.map(parseAuthor);
  }

  if (paper.year) {
    csl.issued = { "date-parts": [[paper.year]] };
  }

  if (paper.journal) {
    csl["container-title"] = paper.journal;
  }

  if (paper.volume) {
    csl.volume = paper.volume;
  }

  if (paper.issue) {
    csl.issue = paper.issue;
  }

  if (paper.pages) {
    csl.page = paper.pages;
  }

  if (paper.doi) {
    csl.DOI = paper.doi;
  }

  if (paper.isbn) {
    csl.ISBN = paper.isbn;
  }

  return csl;
}

const richTextFormats: RichTextFormat[] = ["apa", "mla", "chicago"];
type RichTextFormat = Extract<ExportFormat, "apa" | "mla" | "chicago">;
type RichOutputKind = "html" | "text";
type PersonName = { given: string; family: string };
type RichCitationFormatter = (paper: Paper, kind: RichOutputKind) => string;

interface ExportPreferences {
  clipboardFontFamily?: string;
  clipboardFontSize?: string;
}

const richCitationFormatters: Record<RichTextFormat, RichCitationFormatter> = {
  apa: formatApaCitation,
  mla: formatMlaCitation,
  chicago: formatChicagoCitation,
};

// Main export function that formats paper based on selected format
export function formatPaper(paper: Paper, format: ExportFormat): string {
  if (isRichTextFormat(format)) {
    return formatRichCitation(paper, format, "text");
  }

  const cslData = paperToCSL(paper);
  const cite = new Cite(cslData);

  switch (format) {
    case "bibtex":
      return cite.format("bibtex") as string;

    case "ris":
      return cite.format("ris") as string;

    case "endnote":
      // EndNote uses RIS format as base; we'll enhance it
      return formatEndNote(paper);

    case "csl-json":
      return JSON.stringify(cslData, null, 2);

    default:
      return cite.format("bibtex") as string;
  }
}

function buildClipboardContent(paper: Paper, format: ExportFormat): string | Clipboard.Content {
  if (!isRichTextFormat(format)) {
    return formatPaper(paper, format);
  }

  return {
    html: wrapClipboardHtml(formatRichCitation(paper, format, "html")),
    text: formatRichCitation(paper, format, "text"),
  };
}

function isRichTextFormat(format: ExportFormat): format is RichTextFormat {
  return (richTextFormats as readonly string[]).includes(format);
}

function isRichTextTemplate(template: string): template is RichTextFormat {
  return richTextFormats.includes(template as RichTextFormat);
}

function formatRichCitation(paper: Paper, format: RichTextFormat, kind: RichOutputKind): string {
  return richCitationFormatters[format](paper, kind);
}

function formatApaCitation(paper: Paper, kind: RichOutputKind): string {
  const authors = formatAuthors(paper.authors, "apa");
  const year = paper.year ? `(${paper.year}).` : undefined;
  const title = formatSentence(paper.title, kind, true);
  const journal = formatContainerSegment(paper, kind, {
    includeYear: false,
    issueWithLabel: false,
    pagesWithLabel: false,
  });
  const doi = formatIdentifier(paper.doi, kind);

  return joinSegments([authors, year, title, journal, doi]);
}

function formatMlaCitation(paper: Paper, kind: RichOutputKind): string {
  const authors = formatAuthors(paper.authors, "mla");
  const title = paper.title ? quoteText(paper.title, kind) : undefined;
  const journal = formatContainerSegment(paper, kind, {
    includeYear: true,
    issueWithLabel: true,
    pagesWithLabel: true,
  });
  const doi = formatIdentifier(paper.doi, kind);

  return joinSegments([authors, title, journal, doi]);
}

function formatChicagoCitation(paper: Paper, kind: RichOutputKind): string {
  const authors = formatAuthors(paper.authors, "chicago");
  const year = paper.year ? `${paper.year}.` : undefined;
  const title = paper.title ? quoteText(paper.title, kind) : undefined;
  const journal = formatContainerSegment(paper, kind, {
    includeYear: false,
    issueWithLabel: true,
    pagesWithLabel: false,
  });
  const doi = formatIdentifier(paper.doi, kind);

  return joinSegments([authors, year, title, journal, doi]);
}

function formatAuthors(authors: string[] | undefined, style: RichTextFormat): string | undefined {
  if (!authors || authors.length === 0) {
    return undefined;
  }

  const parsed = authors.map(parsePersonName);

  switch (style) {
    case "apa":
      return formatApaAuthors(parsed);
    case "mla":
      return formatMlaAuthors(parsed);
    case "chicago":
      return formatChicagoAuthors(parsed);
  }
}

function parsePersonName(name: string): PersonName {
  const parsed = parseAuthor(name);
  return {
    given: parsed.given.trim(),
    family: parsed.family.trim(),
  };
}

function formatApaAuthors(authors: PersonName[]): string {
  const formatted = authors.map((author) => {
    const initials = author.given
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => `${part[0]?.toUpperCase() || ""}.`)
      .join(" ");
    return initials ? `${author.family}, ${initials}` : author.family;
  });

  if (formatted.length === 1) {
    return `${formatted[0]}.`;
  }

  if (formatted.length === 2) {
    return `${formatted[0]}, & ${formatted[1]}.`;
  }

  return `${formatted.slice(0, -1).join(", ")}, & ${formatted[formatted.length - 1]}.`;
}

function formatMlaAuthors(authors: PersonName[]): string {
  if (authors.length === 1) {
    return `${authors[0].family}, ${authors[0].given}.`;
  }

  if (authors.length === 2) {
    return `${authors[0].family}, ${authors[0].given}, and ${formatFullName(authors[1])}.`;
  }

  return `${authors[0].family}, ${authors[0].given}, et al.`;
}

function formatChicagoAuthors(authors: PersonName[]): string {
  const formatted = authors.map((author, index) =>
    index === 0 ? `${author.family}, ${author.given}` : formatFullName(author),
  );

  if (formatted.length === 1) {
    return `${formatted[0]}.`;
  }

  if (formatted.length === 2) {
    return `${formatted[0]}, and ${formatted[1]}.`;
  }

  return `${formatted.slice(0, -1).join(", ")}, and ${formatted[formatted.length - 1]}.`;
}

function formatFullName(author: PersonName): string {
  return [author.given, author.family].filter(Boolean).join(" ");
}

function formatSentence(value: string | undefined, kind: RichOutputKind, trailingPeriod = false): string | undefined {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return undefined;
  }

  const escaped = kind === "html" ? escapeHtml(normalized) : normalized;
  if (trailingPeriod && !/[.!?]$/.test(escaped)) {
    return `${escaped}.`;
  }
  return escaped;
}

function quoteText(value: string, kind: RichOutputKind): string {
  const text = formatSentence(value, kind) || "";
  return `"${text}"`;
}

function formatContainerSegment(
  paper: Paper,
  kind: RichOutputKind,
  options: { includeYear: boolean; issueWithLabel: boolean; pagesWithLabel: boolean },
): string | undefined {
  const journal = normalizeWhitespace(paper.journal);
  const volume = normalizeWhitespace(paper.volume);
  const issue = normalizeWhitespace(paper.issue);
  const pages = normalizeWhitespace(paper.pages);
  const year = paper.year ? String(paper.year) : "";

  const parts: string[] = [];

  if (journal) {
    const escapedJournal = kind === "html" ? `<i>${escapeHtml(journal)}</i>` : journal;
    parts.push(escapedJournal);
  }

  if (volume) {
    const escapedVolume = kind === "html" ? `<i>${escapeHtml(volume)}</i>` : volume;
    parts.push(issue ? `${escapedVolume}${options.issueWithLabel ? `, no. ${issue}` : `(${issue})`}` : escapedVolume);
  } else if (issue) {
    parts.push(options.issueWithLabel ? `no. ${issue}` : `(${issue})`);
  }

  if (options.includeYear && year) {
    parts.push(year);
  }

  if (pages) {
    parts.push(options.pagesWithLabel ? `pp. ${pages}` : pages);
  }

  if (parts.length === 0) {
    return options.includeYear && year ? `${year}.` : undefined;
  }

  const joined = parts.join(", ");
  return /[.:!?]$/.test(joined) ? joined : `${joined}.`;
}

function formatIdentifier(value: string | undefined, kind: RichOutputKind): string | undefined {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return undefined;
  }

  const url = `https://doi.org/${normalized}`;
  if (kind === "html") {
    const escapedUrl = escapeHtml(url);
    return `<a href="${escapedUrl}">${escapedUrl}</a>`;
  }
  return url;
}

function joinSegments(segments: Array<string | undefined>): string {
  return segments.filter(Boolean).join(" ");
}

function normalizeWhitespace(value: string | undefined): string {
  return value?.trim().replace(/\s+/g, " ") || "";
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function wrapClipboardHtml(html: string): string {
  const { fontFamily, fontSizePt } = getClipboardStylePreferences();
  return `<div style="font-family: ${buildFontStack(fontFamily)}; font-size: ${fontSizePt}pt; line-height: 1.35;">${html}</div>`;
}

function getClipboardStylePreferences(): { fontFamily: string; fontSizePt: number } {
  const preferences = getPreferenceValues<ExportPreferences>();

  return {
    fontFamily: sanitizeFontFamily(preferences.clipboardFontFamily),
    fontSizePt: sanitizeFontSize(preferences.clipboardFontSize),
  };
}

function sanitizeFontFamily(value: string | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "Arial";
}

function buildFontStack(fontFamily: string): string {
  const primary = quoteFontFamily(fontFamily);
  const fallbacks = ['"Arial"', '"Helvetica Neue"', "Helvetica", "sans-serif"];
  const stack = [primary, ...fallbacks.filter((fallback) => fallback !== primary)];
  return stack.join(", ");
}

function quoteFontFamily(fontFamily: string): string {
  const escaped = fontFamily.replace(/["\\]/g, "\\$&");
  return `"${escaped}"`;
}

function sanitizeFontSize(value: string | undefined): number {
  const size = Number(value);
  if (Number.isFinite(size) && size > 0 && size <= 72) {
    return size;
  }
  return 10;
}

// EndNote format (custom implementation based on RIS spec)
function formatEndNote(paper: Paper): string {
  const typeMap: Record<string, string> = {
    article: "Journal Article",
    "article-journal": "Journal Article",
    book: "Book",
    inproceedings: "Conference Paper",
    "paper-conference": "Conference Paper",
    thesis: "Thesis",
    report: "Report",
    misc: "Generic",
    document: "Generic",
    webpage: "Electronic Article",
    software: "Computer Program",
  };

  const cslData = paperToCSL(paper);
  const paperType = (cslData.type as string) || paper.paperType || "misc";

  const lines: string[] = [];
  lines.push(`%0 ${typeMap[paperType.toLowerCase()] || "Generic"}`);
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

// Copy formatted paper to clipboard
export async function copyFormattedPaper(paper: Paper, format: ExportFormat): Promise<void> {
  await copyContentToClipboard(buildClipboardContent(paper, format), format, `Copying ${getFormatTitle(format)}...`);
}

// Fetch paper and copy in selected format
export async function fetchAndCopyFormatted(baseUrl: string, paperId: string, format: ExportFormat): Promise<void> {
  await copyContentToClipboard(
    fetchPaper(baseUrl, paperId).then((paper) => buildClipboardContent(paper, format)),
    format,
    "Fetching paper...",
  );
}

async function copyContentToClipboard(
  content: Clipboard.Content | string | Promise<Clipboard.Content | string>,
  format: ExportFormat,
  loadingTitle: string,
): Promise<void> {
  const toast = await showToast({
    style: Toast.Style.Animated,
    title: loadingTitle,
  });

  try {
    await Clipboard.copy(await content);

    toast.style = Toast.Style.Success;
    toast.title = `${getFormatTitle(format)} copied`;
  } catch (e) {
    toast.style = Toast.Style.Failure;
    toast.title = "Failed to copy";
    toast.message = e instanceof Error ? e.message : String(e);
  }
}

async function fetchPaper(baseUrl: string, paperId: string): Promise<Paper> {
  const res = await fetch(`${baseUrl}/papers/${paperId}`);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return (await res.json()) as Paper;
}

function getFormatTitle(format: ExportFormat): string {
  return exportFormatTitles[format];
}

// Get list of available CSL templates (for advanced users)
export function getAvailableTemplates(): string[] {
  return [...richTextFormats];
}

// Format paper with any CSL template
export function formatPaperWithTemplate(paper: Paper, template: string): string {
  if (isRichTextTemplate(template)) {
    return formatRichCitation(paper, template, "html");
  }

  throw new Error(`Unsupported template: ${template}`);
}
