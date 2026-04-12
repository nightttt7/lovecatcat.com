import { renderMarkdownToHtml } from "./render";

type ScrollSyncElement = HTMLTextAreaElement | HTMLElement;

export type MarkdownPreviewSelectors = {
  input: string;
  preview: string;
  inputPane: string;
  previewPane: string;
  switches: string;
};

export type MarkdownPreviewControllerOptions = {
  selectors?: Partial<MarkdownPreviewSelectors>;
  desktopMediaQuery?: string;
  enhancedAttribute?: string;
  emptyStateAttribute?: string;
  renderHtml?: (content: string) => string;
};

export type MarkdownPreviewController = {
  renderNow: () => void;
  scheduleRender: () => void;
  syncLayout: () => void;
  destroy: () => void;
};

export const defaultMarkdownPreviewSelectors: MarkdownPreviewSelectors = {
  input: "[data-post-editor-input]",
  preview: "[data-post-editor-preview]",
  inputPane: '[data-post-editor-pane="input"]',
  previewPane: '[data-post-editor-pane="preview"]',
  switches: "[data-post-editor-switch]"
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function updateButtonState(buttons: HTMLElement[], activePane: string): void {
  buttons.forEach((button: HTMLElement) => {
    const isActive = button.getAttribute("data-post-editor-switch") === activePane;
    button.classList.toggle("btn-primary", isActive);
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
}

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

export const attachMarkdownPreviewController = (
  root: HTMLElement,
  options: MarkdownPreviewControllerOptions = {}
): MarkdownPreviewController | null => {
  const selectors = {
    ...defaultMarkdownPreviewSelectors,
    ...options.selectors
  };
  const input = root.querySelector(selectors.input);
  const preview = root.querySelector(selectors.preview);
  const inputPane = root.querySelector(selectors.inputPane);
  const previewPane = root.querySelector(selectors.previewPane);
  const buttons = Array.from(root.querySelectorAll<HTMLElement>(selectors.switches));

  if (!(input instanceof HTMLTextAreaElement) || !(preview instanceof HTMLElement) || !(inputPane instanceof HTMLElement) || !(previewPane instanceof HTMLElement)) {
    return null;
  }

  const desktopQuery = window.matchMedia(options.desktopMediaQuery || "(min-width: 1012px)");
  const renderHtml = options.renderHtml || renderMarkdownToHtml;
  const enhancedAttribute = options.enhancedAttribute || "data-post-editor-enhanced";
  const emptyStateAttribute = options.emptyStateAttribute || "data-post-editor-empty-state";
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
  const emptyState = previewFrame.getAttribute(emptyStateAttribute) || "";
  const buttonHandlers = new Map<HTMLElement, EventListener>();

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

  function renderNow() {
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

    previewFrame.innerHTML = renderHtml(editorInput.value);
    previewFrame.setAttribute("data-post-editor-empty", "false");
    syncScroller(lastScrollSource, lastScrollSource === editorInput ? previewFrame : editorInput);
  }

  function scheduleRender() {
    if (renderFrame !== 0) {
      return;
    }

    renderFrame = window.requestAnimationFrame(renderNow);
  }

  function handleButtonClick(button: HTMLElement) {
    activePane = button.getAttribute("data-post-editor-switch") === "preview" ? "preview" : "input";
    syncLayout();
  }

  function handleInputScroll() {
    if (isSyncingScroll) {
      return;
    }

    lastScrollSource = editorInput;
    syncScroller(editorInput, previewFrame);
  }

  function handlePreviewScroll() {
    if (isSyncingScroll) {
      return;
    }

    lastScrollSource = previewFrame;
    syncScroller(previewFrame, editorInput);
  }

  function handleMediaChange() {
    syncLayout();
  }

  root.setAttribute(enhancedAttribute, "true");

  buttons.forEach((button) => {
    const handler = () => handleButtonClick(button);
    buttonHandlers.set(button, handler);
    button.addEventListener("click", handler);
  });
  editorInput.addEventListener("input", scheduleRender);
  editorInput.addEventListener("scroll", handleInputScroll);
  previewFrame.addEventListener("scroll", handlePreviewScroll);

  if (typeof desktopQuery.addEventListener === "function") {
    desktopQuery.addEventListener("change", handleMediaChange);
  } else {
    desktopQuery.addListener(handleMediaChange);
  }

  syncLayout();
  scheduleRender();

  return {
    renderNow,
    scheduleRender,
    syncLayout,
    destroy() {
      if (renderFrame !== 0) {
        window.cancelAnimationFrame(renderFrame);
      }

      if (scrollResetFrame !== 0) {
        window.cancelAnimationFrame(scrollResetFrame);
      }

      buttons.forEach((button) => {
        const handler = buttonHandlers.get(button);

        if (handler) {
          button.removeEventListener("click", handler);
        }
      });
      editorInput.removeEventListener("input", scheduleRender);
      editorInput.removeEventListener("scroll", handleInputScroll);
      previewFrame.removeEventListener("scroll", handlePreviewScroll);

      if (typeof desktopQuery.removeEventListener === "function") {
        desktopQuery.removeEventListener("change", handleMediaChange);
      } else {
        desktopQuery.removeListener(handleMediaChange);
      }
    }
  };
};

export const attachMarkdownPreviewControllers = (
  roots: Iterable<HTMLElement>,
  options: MarkdownPreviewControllerOptions = {}
): MarkdownPreviewController[] => {
  const controllers: MarkdownPreviewController[] = [];

  for (const root of roots) {
    const controller = attachMarkdownPreviewController(root, options);

    if (controller) {
      controllers.push(controller);
    }
  }

  return controllers;
};