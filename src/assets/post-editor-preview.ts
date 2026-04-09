type ParsedListItem = {
  indent: number;
  ordered: boolean;
  startNumber?: number;
  checked: boolean | null;
  content: string;
};

type RenderListItem = {
  checked: boolean | null;
  contentLines: string[];
};

type RenderListResult = {
  html: string;
  nextIndex: number;
};

type ScrollSyncElement = HTMLTextAreaElement | HTMLElement;

function initPostEditorPreview() {
  const editorRoots = Array.from(document.querySelectorAll("[data-post-editor-root]"));

  if (editorRoots.length === 0) {
    return;
  }

  const desktopQuery = window.matchMedia("(min-width: 1012px)");

  function escapeHtml(value: string): string {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function sanitizeUrl(value: string): string {
    const trimmed = value.trim();

    if (!trimmed) {
      return "#";
    }

    if (/^(https?:|mailto:)/i.test(trimmed) || trimmed.startsWith("/") || trimmed.startsWith("./") || trimmed.startsWith("../") || trimmed.startsWith("#")) {
      return trimmed;
    }

    return "#";
  }

  function renderInline(source: string, disableLinks = false): string {
    if (!source) {
      return "";
    }

    const placeholders: string[] = [];

    function stash(value: string): string {
      const token = `\u0000${placeholders.length}\u0000`;
      placeholders.push(value);
      return token;
    }

    let rendered = escapeHtml(source);

    rendered = rendered.replace(/`([^`]+)`/g, (_match: string, code: string) => stash(`<code>${code}</code>`));

    if (!disableLinks) {
      rendered = rendered.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+\"([^\"]*)\")?\)/g, (_match: string, alt: string, src: string, title?: string) => {
        const safeSrc = escapeHtml(sanitizeUrl(src));
        const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
        return stash(`<img src="${safeSrc}" alt="${alt}"${titleAttr} />`);
      });

      rendered = rendered.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+\"([^\"]*)\")?\)/g, (_match: string, label: string, href: string, title?: string) => {
        const safeHref = escapeHtml(sanitizeUrl(href));
        const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
        return stash(`<a href="${safeHref}"${titleAttr}>${renderInline(label, true)}</a>`);
      });

      rendered = rendered.replace(/(^|[\s(])((?:https?:\/\/|mailto:)[^\s<]+)/g, (_match: string, prefix: string, url: string) => {
        const safeUrl = escapeHtml(sanitizeUrl(url));
        return `${prefix}${stash(`<a href="${safeUrl}">${url}</a>`)}`;
      });
    }

    rendered = rendered
      .replace(/~~([^~]+)~~/g, "<del>$1</del>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/__([^_]+)__/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*][\s\S]*?)\*(?!\*)/g, "$1<em>$2</em>")
      .replace(/(^|[^_])_([^_][\s\S]*?)_(?!_)/g, "$1<em>$2</em>");

    return rendered.replace(/\u0000(\d+)\u0000/g, (_match: string, index: string) => placeholders[Number(index)] ?? "");
  }

  function renderParagraph(lines: string[]): string {
    const content = lines.map((line) => line.trim()).join("\n");
    return `<p>${renderInline(content).replace(/\n/g, "<br />")}</p>`;
  }

  function parseTableRow(line: string): string[] | null {
    if (!line.includes("|")) {
      return null;
    }

    const trimmed = line.trim();
    const normalized = trimmed.replace(/^\|/, "").replace(/\|$/, "");
    const cells = normalized.split("|").map((cell) => cell.trim());

    return cells.length > 1 ? cells : null;
  }

  function isTableSeparator(line: string, expectedColumns: number): boolean {
    const cells = parseTableRow(line);

    if (!cells || cells.length !== expectedColumns) {
      return false;
    }

    return cells.every((cell: string) => /^:?-{3,}:?$/.test(cell));
  }

  function parseListItem(line: string): ParsedListItem | null {
    const taskMatch = line.match(/^(\s*)([-*+])\s+\[( |x|X)\]\s+(.*)$/);

    if (taskMatch) {
      return {
        indent: taskMatch[1].length,
        ordered: false,
        checked: taskMatch[3].toLowerCase() === "x",
        content: taskMatch[4]
      };
    }

    const orderedMatch = line.match(/^(\s*)(\d+)\.\s+(.*)$/);

    if (orderedMatch) {
      return {
        indent: orderedMatch[1].length,
        ordered: true,
        startNumber: Number(orderedMatch[2]),
        checked: null,
        content: orderedMatch[3]
      };
    }

    const bulletMatch = line.match(/^(\s*)([-*+])\s+(.*)$/);

    if (bulletMatch) {
      return {
        indent: bulletMatch[1].length,
        ordered: false,
        checked: null,
        content: bulletMatch[3]
      };
    }

    return null;
  }

  function renderList(lines: string[], startIndex: number): RenderListResult | null {
    const firstItem = parseListItem(lines[startIndex]);

    if (!firstItem) {
      return null;
    }

    const items: RenderListItem[] = [];
    let currentItem: RenderListItem | null = null;
    let index = startIndex;

    function commitItem() {
      if (currentItem) {
        items.push(currentItem);
        currentItem = null;
      }
    }

    while (index < lines.length) {
      const line = lines[index];
      const trimmed = line.trim();

      if (!trimmed) {
        break;
      }

      const item = parseListItem(line);

      if (item && item.ordered === firstItem.ordered && item.indent === firstItem.indent) {
        commitItem();
        currentItem = {
          checked: item.checked,
          contentLines: [item.content]
        };
        index += 1;
        continue;
      }

      if (currentItem && /^\s+/.test(line)) {
        currentItem.contentLines.push(trimmed);
        index += 1;
        continue;
      }

      break;
    }

    commitItem();

    const tagName = firstItem.ordered ? "ol" : "ul";
    const startAttr = firstItem.ordered && firstItem.startNumber && firstItem.startNumber !== 1 ? ` start="${firstItem.startNumber}"` : "";
    const containsTaskList = items.some((item) => item.checked !== null);
    const classAttr = containsTaskList ? ' class="contains-task-list"' : "";
    const listHtml = items
      .map((item) => {
        const content = renderInline(item.contentLines.join("\n")).replace(/\n/g, "<br />");

        if (item.checked === null) {
          return `<li>${content}</li>`;
        }

        return `<li class="task-list-item"><input type="checkbox" disabled${item.checked ? " checked" : ""} /> ${content}</li>`;
      })
      .join("");

    return {
      html: `<${tagName}${startAttr}${classAttr}>${listHtml}</${tagName}>`,
      nextIndex: index
    };
  }

  function renderMarkdown(source: string): string {
    const lines = source.replace(/\r\n?/g, "\n").split("\n");
    const rendered: string[] = [];
    let paragraphLines: string[] = [];

    function flushParagraph() {
      if (paragraphLines.length === 0) {
        return;
      }

      rendered.push(renderParagraph(paragraphLines));
      paragraphLines = [];
    }

    let index = 0;

    while (index < lines.length) {
      const line = lines[index];
      const trimmed = line.trim();

      if (!trimmed) {
        flushParagraph();
        index += 1;
        continue;
      }

      const fenceMatch = trimmed.match(/^```([A-Za-z0-9_-]+)?\s*$/);

      if (fenceMatch) {
        flushParagraph();
        const codeLines = [];
        const language = fenceMatch[1] ? escapeHtml(fenceMatch[1]) : "";
        index += 1;

        while (index < lines.length && !lines[index].trim().startsWith("```")) {
          codeLines.push(lines[index]);
          index += 1;
        }

        if (index < lines.length) {
          index += 1;
        }

        const languageClass = language ? ` class="language-${language}"` : "";
        rendered.push(`<pre><code${languageClass}>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        continue;
      }

      const headingMatch = line.match(/^\s{0,3}(#{1,6})\s+(.*)$/);

      if (headingMatch) {
        flushParagraph();
        const level = headingMatch[1].length;
        rendered.push(`<h${level}>${renderInline(headingMatch[2].trim())}</h${level}>`);
        index += 1;
        continue;
      }

      if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(trimmed.replace(/\s+/g, ""))) {
        flushParagraph();
        rendered.push("<hr />");
        index += 1;
        continue;
      }

      if (/^>\s?/.test(trimmed)) {
        flushParagraph();
        const quoteLines = [];

        while (index < lines.length) {
          const quoteLine = lines[index];
          const quoteMatch = quoteLine.match(/^>\s?(.*)$/);

          if (!quoteMatch) {
            break;
          }

          quoteLines.push(quoteMatch[1]);
          index += 1;
        }

        rendered.push(`<blockquote>${renderMarkdown(quoteLines.join("\n"))}</blockquote>`);
        continue;
      }

      const listResult = renderList(lines, index);

      if (listResult) {
        flushParagraph();
        rendered.push(listResult.html);
        index = listResult.nextIndex;
        continue;
      }

      const headerCells = parseTableRow(line);
      if (headerCells && index + 1 < lines.length && isTableSeparator(lines[index + 1], headerCells.length)) {
        flushParagraph();
        const bodyRows = [];
        index += 2;

        while (index < lines.length) {
          const rowCells = parseTableRow(lines[index]);

          if (!rowCells || rowCells.length !== headerCells.length) {
            break;
          }

          bodyRows.push(rowCells);
          index += 1;
        }

        const headHtml = headerCells.map((cell: string) => `<th>${renderInline(cell)}</th>`).join("");
        const bodyHtml = bodyRows
          .map((row) => `<tr>${row.map((cell: string) => `<td>${renderInline(cell)}</td>`).join("")}</tr>`)
          .join("");
        rendered.push(`<table><thead><tr>${headHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`);
        continue;
      }

      paragraphLines.push(line);
      index += 1;
    }

    flushParagraph();

    return rendered.join("\n");
  }

  function updateButtonState(buttons: Element[], activePane: string): void {
    buttons.forEach((button: Element) => {
      const isActive = button.getAttribute("data-post-editor-switch") === activePane;
      button.classList.toggle("btn-primary", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }

  function attachMediaListener(listener: (event?: MediaQueryListEvent) => void): void {
    if (typeof desktopQuery.addEventListener === "function") {
      desktopQuery.addEventListener("change", listener);
      return;
    }

    desktopQuery.addListener(listener);
  }

  editorRoots.forEach((root) => {
    const input = root.querySelector("[data-post-editor-input]");
    const preview = root.querySelector("[data-post-editor-preview]");
    const inputPane = root.querySelector('[data-post-editor-pane="input"]');
    const previewPane = root.querySelector('[data-post-editor-pane="preview"]');
    const buttons = Array.from(root.querySelectorAll("[data-post-editor-switch]"));

    if (!(input instanceof HTMLTextAreaElement) || !(preview instanceof HTMLElement) || !(inputPane instanceof HTMLElement) || !(previewPane instanceof HTMLElement)) {
      return;
    }

    const editorInput = input;
    const previewFrame = preview;
    const editorInputPane = inputPane;
    const editorPreviewPane = previewPane;

    let activePane = "input";
    let renderFrame = 0;
    let scrollResetFrame = 0;
    let lastRenderedValue: string | null = null;
    let lastScrollSource: ScrollSyncElement = editorInput;
    let isSyncingScroll = false;
    const emptyState = previewFrame.getAttribute("data-post-editor-empty-state") || "";

    function getScrollProgress(element: ScrollSyncElement): number {
      const maxScrollTop = element.scrollHeight - element.clientHeight;

      if (maxScrollTop <= 0) {
        return 0;
      }

      return element.scrollTop / maxScrollTop;
    }

    function setScrollProgress(element: ScrollSyncElement, progress: number): void {
      const maxScrollTop = element.scrollHeight - element.clientHeight;

      if (maxScrollTop <= 0) {
        element.scrollTop = 0;
        return;
      }

      element.scrollTop = Math.min(maxScrollTop, Math.max(0, progress * maxScrollTop));
    }

    function syncScroller(source: ScrollSyncElement, target: ScrollSyncElement): void {
      const progress = getScrollProgress(source);

      if (scrollResetFrame !== 0) {
        window.cancelAnimationFrame(scrollResetFrame);
      }

      isSyncingScroll = true;
      setScrollProgress(target, progress);
      scrollResetFrame = window.requestAnimationFrame(() => {
        isSyncingScroll = false;
        scrollResetFrame = 0;
      });
    }

    function syncLayout() {
      const showBothPanes = desktopQuery.matches;
      editorInputPane.hidden = !showBothPanes && activePane !== "input";
      editorPreviewPane.hidden = !showBothPanes && activePane !== "preview";
      updateButtonState(buttons, activePane);
    }

    function renderPreview() {
      renderFrame = 0;

      if (editorInput.value === lastRenderedValue) {
        return;
      }

      lastRenderedValue = editorInput.value;
      const trimmed = editorInput.value.trim();

      if (!trimmed) {
        previewFrame.innerHTML = `<p class="f6 mb-0">${escapeHtml(emptyState)}</p>`;
        previewFrame.setAttribute("data-post-editor-empty", "true");
        return;
      }

      previewFrame.innerHTML = renderMarkdown(editorInput.value);
      previewFrame.setAttribute("data-post-editor-empty", "false");
      syncScroller(lastScrollSource, lastScrollSource === editorInput ? previewFrame : editorInput);
    }

    function scheduleRender() {
      if (renderFrame !== 0) {
        return;
      }

      renderFrame = window.requestAnimationFrame(renderPreview);
    }

    root.setAttribute("data-post-editor-enhanced", "true");

    buttons.forEach((button) => {
      button.addEventListener("click", () => {
        activePane = button.getAttribute("data-post-editor-switch") === "preview" ? "preview" : "input";
        syncLayout();
      });
    });

    editorInput.addEventListener("input", scheduleRender);
    editorInput.addEventListener("scroll", () => {
      if (isSyncingScroll) {
        return;
      }

      lastScrollSource = editorInput;
      syncScroller(editorInput, previewFrame);
    });
    previewFrame.addEventListener("scroll", () => {
      if (isSyncingScroll) {
        return;
      }

      lastScrollSource = previewFrame;
      syncScroller(previewFrame, editorInput);
    });
    attachMediaListener(syncLayout);
    syncLayout();
    scheduleRender();
  });
}

const rawPostEditorPreviewScript = `(${initPostEditorPreview.toString()})();`;

export const postEditorPreviewScript = rawPostEditorPreviewScript.replace(/__name\([^;]+\);/g, "");