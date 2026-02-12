import { PageLayout, SharedLayout } from "./quartz/cfg"
import * as Component from "./quartz/components"

// components shared across all pages
export const sharedPageComponents: SharedLayout = {
  head: Component.Head(),
  header: [],
  afterBody: [],
  footer: Component.Footer({
    links: {
      GitHub: "https://github.com/jackyzha0/quartz",
      "Discord Community": "https://discord.gg/cRFFHYye7t",
    },
  }),
}

// components for pages that display a single page (e.g. a single note)
export const defaultContentPageLayout: PageLayout = {
  beforeBody: [
    Component.ConditionalRender({
      component: Component.Breadcrumbs(),
      condition: (page) => page.fileData.slug !== "index",
    }),
    Component.ArticleTitle(),
    Component.ContentMeta(),
    Component.TagList(),
  ],
  left: [
    Component.PageTitle(),
    Component.MobileOnly(Component.Spacer()),
    Component.Flex({
      components: [
        {
          Component: Component.Search(),
          grow: true,
        },
        { Component: Component.Darkmode() },
        { Component: Component.ReaderMode() },
      ],
    }),
    Component.Explorer({
      // Keep storage structure (posts/YYYY/MM/...) but hide it from navigation.
      filterFn: (node) => {
        const slug = String(node.slug ?? "")
        if (slug.startsWith("posts/")) {
          const depth = slug.split("/").filter(Boolean).length
          // keep only `posts/index`
          return depth <= 2
        }
        return true
      },
      mapFn: (node) => {
        const slug = String(node.slug ?? "")
        if (slug === "posts/index") node.displayName = "전체 글"
        if (slug === "index") node.displayName = "Home"
      },
    }),
  ],
  right: [
    Component.Graph(),
    Component.DesktopOnly(Component.TableOfContents()),
    Component.Backlinks(),
  ],
}

// components for pages that display lists of pages  (e.g. tags or folders)
export const defaultListPageLayout: PageLayout = {
  beforeBody: [Component.Breadcrumbs(), Component.ArticleTitle(), Component.ContentMeta()],
  left: [
    Component.PageTitle(),
    Component.MobileOnly(Component.Spacer()),
    Component.Flex({
      components: [
        {
          Component: Component.Search(),
          grow: true,
        },
        { Component: Component.Darkmode() },
      ],
    }),
    Component.Explorer({
      filterFn: (node) => {
        const slug = String(node.slug ?? "")
        if (slug.startsWith("posts/")) {
          const depth = slug.split("/").filter(Boolean).length
          return depth <= 2
        }
        return true
      },
      mapFn: (node) => {
        const slug = String(node.slug ?? "")
        if (slug === "posts/index") node.displayName = "전체 글"
        if (slug === "index") node.displayName = "Home"
      },
    }),
  ],
  right: [],
}
