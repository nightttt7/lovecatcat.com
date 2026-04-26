import { attachMarkdownPreviewControllers } from "./preview-controller";

function initPostEditorPreview() {
  const editorRoots = Array.from(document.querySelectorAll<HTMLElement>("[data-post-editor-root]"));

  if (editorRoots.length === 0) {
    return;
  }

  attachMarkdownPreviewControllers(editorRoots);
}

initPostEditorPreview();