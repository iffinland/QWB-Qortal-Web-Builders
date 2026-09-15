import type { ContentBundle } from '../content/schema';

/**
 * A view is a pure render function plus an optional mount hook.
 *
 * Phase 2 owner controls and inline editing are added inside `mount()` on the
 * same containers, which is why views own their root element rather than
 * mutating the document directly.
 */
export interface View {
  readonly title: string;
  readonly description: string;
  readonly html: string;
  mount?(root: HTMLElement, context: ViewContext): void;
}

export interface ViewContext {
  readonly content: ContentBundle;
}
