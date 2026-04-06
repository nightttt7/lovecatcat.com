import { expect } from "vitest";

export const expectHtmlToContainAll = (html: string, fragments: string[]) => {
  for (const fragment of fragments) {
    expect(html).toContain(fragment);
  }
};

export const expectHtmlToExcludeAll = (html: string, fragments: string[]) => {
  for (const fragment of fragments) {
    expect(html).not.toContain(fragment);
  }
};

export const expectHtmlFragmentsInOrder = (html: string, fragments: string[]) => {
  let previousIndex = -1;

  for (const fragment of fragments) {
    const currentIndex = html.indexOf(fragment, previousIndex + 1);

    expect(currentIndex, `Expected to find fragment in order: ${fragment}`).toBeGreaterThanOrEqual(0);
    expect(currentIndex, `Expected fragment to appear after the previous one: ${fragment}`).toBeGreaterThan(previousIndex);

    previousIndex = currentIndex;
  }
};

export const getMainHtml = (html: string) => {
  const mainStart = html.indexOf("<main");
  const mainEnd = html.indexOf("</main>", mainStart);

  expect(mainStart, "Expected to find the opening <main> element").toBeGreaterThanOrEqual(0);
  expect(mainEnd, "Expected to find the closing </main> element").toBeGreaterThanOrEqual(0);

  return html.slice(mainStart, mainEnd + "</main>".length);
};

export const getSectionHtmlByHeading = (html: string, heading: string) => {
  const headingMarkup = `<h2 class="h3 mb-0">${heading}</h2>`;
  const headingIndex = html.indexOf(headingMarkup);

  expect(headingIndex, `Expected to find a section headed ${heading}`).toBeGreaterThanOrEqual(0);

  const sectionStart = html.lastIndexOf("<section", headingIndex);
  const sectionEnd = html.indexOf("</section>", headingIndex);

  expect(sectionStart, `Expected to find the opening <section> for ${heading}`).toBeGreaterThanOrEqual(0);
  expect(sectionEnd, `Expected to find the closing </section> for ${heading}`).toBeGreaterThanOrEqual(0);

  return html.slice(sectionStart, sectionEnd + "</section>".length);
};

export const expectResponsivePaginationMarkup = (html: string, fragments: string[] = []) => {
  expectHtmlToContainAll(html, ["data-pagination-root", "data-pagination-full", ...fragments]);
};

export const expectNoPaginationMarkup = (html: string) => {
  expectHtmlToExcludeAll(html, ['class="pagination"']);
};

export const expectDeleteConfirmationPanel = (
  html: string,
  {
    actionPath,
    includesInteractiveHooks = false,
    extraFragments = []
  }: {
    actionPath: string;
    includesInteractiveHooks?: boolean;
    extraFragments?: string[];
  }
) => {
  expectHtmlToContainAll(html, ['action="' + actionPath + '"', "delete-confirm-panel", ">确认删除<", ">取消<", ...extraFragments]);

  if (includesInteractiveHooks) {
    expectHtmlToContainAll(html, ["delete-confirm-submit')?.focus()", "event.key === 'Escape'"]);
  }
};