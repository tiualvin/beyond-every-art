/**
 * How anything on the page asks the masthead to open the subscribe modal.
 *
 * The modal lives inside `SiteChrome`, which the layout renders in the header,
 * so a call to action further down the tree cannot reach its state. A window
 * event keeps that state where it is — one modal, one scroll lock, one place
 * that knows how to close it — without lifting it into a provider that wraps
 * every page for the sake of two buttons.
 */
export const SUBSCRIBE_EVENT = 'bea:open-subscribe'

export function openSubscribeModal(): void {
  window.dispatchEvent(new Event(SUBSCRIBE_EVENT))
}
