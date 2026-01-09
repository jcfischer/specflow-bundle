/**
 * F-8: Simple Markdown to HTML Converter
 * Supports headers, lists, code blocks, inline code, bold, italic, and paragraphs.
 */

/**
 * Escape HTML special characters to prevent XSS
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Process inline markdown elements (bold, italic, inline code)
 */
function processInline(text: string): string {
  // Inline code (must be first to prevent escaping inside code)
  const codeSegments: string[] = [];
  let processed = text.replace(/`([^`]+)`/g, (_, code) => {
    const idx = codeSegments.length;
    codeSegments.push(`<code class="bg-gray-100 text-gray-800 px-1 py-0.5 rounded text-sm font-mono">${escapeHtml(code)}</code>`);
    return `\x00CODE${idx}\x00`;
  });

  // Escape HTML after extracting code
  processed = escapeHtml(processed);

  // Restore code segments
  processed = processed.replace(/\x00CODE(\d+)\x00/g, (_, idx) => codeSegments[parseInt(idx)]);

  // Bold (**text** or __text__)
  processed = processed.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  processed = processed.replace(/__([^_]+)__/g, "<strong>$1</strong>");

  // Italic (*text* or _text_) - careful not to match ** or __
  processed = processed.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>");
  processed = processed.replace(/(?<!_)_([^_]+)_(?!_)/g, "<em>$1</em>");

  return processed;
}

/**
 * Convert markdown string to HTML
 */
export function markdownToHtml(markdown: string): string {
  const lines = markdown.split("\n");
  const result: string[] = [];
  let inCodeBlock = false;
  let codeBlockContent: string[] = [];
  let codeBlockLang = "";
  let inList = false;
  let listItems: string[] = [];
  let paragraphLines: string[] = [];

  const flushParagraph = () => {
    if (paragraphLines.length > 0) {
      const content = processInline(paragraphLines.join(" "));
      result.push(`<p class="mb-4 text-gray-700 leading-relaxed">${content}</p>`);
      paragraphLines = [];
    }
  };

  const flushList = () => {
    if (listItems.length > 0) {
      result.push('<ul class="list-disc list-inside mb-4 space-y-1 text-gray-700">');
      listItems.forEach((item) => {
        result.push(`  <li>${processInline(item)}</li>`);
      });
      result.push("</ul>");
      listItems = [];
      inList = false;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code block start/end
    if (line.startsWith("```")) {
      if (!inCodeBlock) {
        flushParagraph();
        flushList();
        inCodeBlock = true;
        codeBlockLang = line.slice(3).trim();
        codeBlockContent = [];
      } else {
        const code = escapeHtml(codeBlockContent.join("\n"));
        result.push(
          `<pre class="bg-gray-900 text-gray-100 p-4 rounded-lg mb-4 overflow-x-auto"><code class="text-sm font-mono">${code}</code></pre>`
        );
        inCodeBlock = false;
        codeBlockContent = [];
        codeBlockLang = "";
      }
      continue;
    }

    // Inside code block
    if (inCodeBlock) {
      codeBlockContent.push(line);
      continue;
    }

    // Empty line - flush paragraph and list
    if (line.trim() === "") {
      flushParagraph();
      flushList();
      continue;
    }

    // Headers
    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headerMatch) {
      flushParagraph();
      flushList();
      const level = headerMatch[1].length;
      const text = processInline(headerMatch[2]);
      const classes: Record<number, string> = {
        1: "text-2xl font-bold text-gray-900 mb-4 mt-6",
        2: "text-xl font-semibold text-gray-900 mb-3 mt-5",
        3: "text-lg font-semibold text-gray-800 mb-2 mt-4",
        4: "text-base font-medium text-gray-800 mb-2 mt-3",
        5: "text-sm font-medium text-gray-700 mb-1 mt-2",
        6: "text-sm font-medium text-gray-600 mb-1 mt-2",
      };
      result.push(`<h${level} class="${classes[level]}">${text}</h${level}>`);
      continue;
    }

    // List items (- or *)
    const listMatch = line.match(/^[\-\*]\s+(.+)$/);
    if (listMatch) {
      flushParagraph();
      inList = true;
      listItems.push(listMatch[1]);
      continue;
    }

    // If we were in a list but this isn't a list item, flush the list
    if (inList) {
      flushList();
    }

    // Regular text - accumulate for paragraph
    paragraphLines.push(line);
  }

  // Flush any remaining content
  if (inCodeBlock) {
    // Unclosed code block - render it anyway
    const code = escapeHtml(codeBlockContent.join("\n"));
    result.push(
      `<pre class="bg-gray-900 text-gray-100 p-4 rounded-lg mb-4 overflow-x-auto"><code class="text-sm font-mono">${code}</code></pre>`
    );
  }
  flushParagraph();
  flushList();

  return result.join("\n");
}
