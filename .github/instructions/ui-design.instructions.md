---
description: "Use when editing the blog UI, page layout, HTML template strings, or CSS styling in the Hono app."
applyTo: "src/**/*.ts"
---

## UI Design and CSS Rules

### Overall Direction
- Keep the site minimal, clean, and close to a GitHub-style blog interface.
- Do not change page copy, information architecture, or route semantics. Only adjust UI presentation and layout.
- Reuse the existing layout language whenever possible so the home page list, post detail view, comment area, header, and footer stay visually consistent.

### CSS Baseline
- Use local Primer CSS consistently, with `/static/primer.css` as the stylesheet entry point.
- Keep `data-color-mode="light"` and `data-light-theme="light"` on the `html` element.
- Do not introduce Tailwind, Bootstrap, or any other CSS framework.
- Avoid adding custom CSS unless necessary. Prefer built-in Primer components and utility classes.
- If Primer cannot cover the requirement, add only a very small amount of local styling and keep it centralized in a dedicated style resource rather than scattered inline styles.

### Layout Rules
- Keep the page background as `bg-gray-light`.
- Use Primer `Header Header--dark` for the top navigation, wrapped in `container-lg`.
- Use `container-lg` plus Primer spacing utilities for the main content area instead of adding extra custom layout class names.
- Keep the footer simple with a thin border, centered small text, and consistent gray typography.

### Component Rules
- Prefer `Box`, `Box-header`, and `Box-body` for post list items, post content, notices, and comment entries.
- Prefer Primer `h1`, `h2`, `h3`, or `h2`/`h3` classes for title hierarchy instead of hard-coded font sizes.
- Prefer combinations such as `f6`, `text-gray`, `text-bold`, `d-inline-block`, and `mr-*` for metadata rows.
- Reuse Primer `pagination` and `paginate-container` for pagination.
- Use `markdown-body` consistently as the Markdown content container rather than inventing a separate Markdown typography system.

### Implementation Approach
- Pages in this project are primarily rendered through Hono `html` template strings, so UI work should primarily adjust template structure and Primer class composition.
- Avoid adding non-semantic wrapper elements purely for styling. Any new container should serve layout or Primer component structure.
- Prefer class replacement or recomposition over introducing a large set of new custom selectors.

### Responsiveness and Consistency
- Design for both desktop and mobile by default, preferably with Primer flex, spacing, and breakpoint utility classes.
- Keep similar information blocks aligned in spacing, title level, metadata styling, and box structure.
- When adding UI to a new page, start from the existing home page and post page rhythm before extending locally.
- Keep the mobile header menu implemented with a `details` panel. Do not revert it to Primer `dropdown-menu`; that combination has already proved unstable in the current narrow-screen layout.
- When editing pagination templates or styles, preserve the `full`, `compact`, and `minimal` responsive pagination variants and the related width measurement nodes. Do not "simplify" pagination by only deleting CSS.
- `.responsive-pagination` must continue overriding Primer's default `.pagination > *` visibility rules. When the root is marked with `data-pagination-has-responsive-variants="false"`, mobile layouts must not hide the full pagination, or author-filter and tag-filter pages will lose pagination access.
- When adjusting mobile-menu or responsive-pagination markers, update the regression assertions in `src/render/layout.test.ts` as well.

### Prohibited Changes
- Do not change existing copy, field ordering, or business logic just to make the UI look better.
- Do not restore large legacy blocks of custom CSS.
- Do not mix data-layer refactors unrelated to presentation into UI files unless the task explicitly requires it.