import { createContext, useCallback, useContext, type ReactNode } from 'react'

import { classifyLink } from './links'

export type LinkActions = {
  siteUrl: string
  openArticle(slug: string, href: string): void
  openExternal(href: string): void
}

const LinkContext = createContext<LinkActions | null>(null)

export function LinkProvider({
  actions,
  children,
}: {
  actions: LinkActions
  children: ReactNode
}) {
  return <LinkContext.Provider value={actions}>{children}</LinkContext.Provider>
}

function useLinkActions(): LinkActions {
  const actions = useContext(LinkContext)
  if (!actions) throw new Error('LinkProvider is missing.')
  return actions
}

/** Opens a link by the reader's link policy. */
export function useOpenLink(): (href: string) => void {
  const actions = useLinkActions()
  return useCallback(
    (href: string) => {
      const target = classifyLink(href, actions.siteUrl)
      if (target.kind === 'article')
        actions.openArticle(target.slug, target.href)
      else if (target.kind === 'external') actions.openExternal(target.href)
    },
    [actions],
  )
}

/** Opens an internal link the server already identified. */
export function useOpenArticle(): (slug: string, href: string) => void {
  return useLinkActions().openArticle
}

/** Opens a URL in the system browser, without asking whether it is an article. */
export function useOpenExternal(): (href: string) => void {
  return useLinkActions().openExternal
}
