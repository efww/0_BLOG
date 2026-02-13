import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "../types"

import style from "../styles/listPage.scss"
import { PageList, SortFn, byDateAndAlphabetical } from "../PageList"
import { Root } from "hast"
import { htmlToJsx } from "../../util/jsx"
import { i18n } from "../../i18n"
import { QuartzPluginData } from "../../plugins/vfile"
import { ComponentChildren } from "preact"
import { concatenateResources } from "../../util/resources"
import { trieFromAllFiles } from "../../util/ctx"

interface FolderContentOptions {
  /**
   * Whether to display number of folders
   */
  showFolderCount: boolean
  showSubfolders: boolean
  sort?: SortFn
}

const defaultOptions: FolderContentOptions = {
  showFolderCount: true,
  showSubfolders: true,
}

export default ((opts?: Partial<FolderContentOptions>) => {
  const options: FolderContentOptions = { ...defaultOptions, ...opts }

  const FolderContent: QuartzComponent = (props: QuartzComponentProps) => {
    const { tree, fileData, allFiles, cfg } = props

    const trie = (props.ctx.trie ??= trieFromAllFiles(allFiles))
    const folder = trie.findNode(fileData.slug!.split("/"))
    if (!folder) {
      return null
    }

    const isPostsRoot = fileData.slug === ("posts/index" as any) || fileData.slug === ("index" as any)

    const collectDescendantPages = (node: any, acc: QuartzPluginData[]) => {
      for (const child of node.children ?? []) {
        if (child?.data?.slug && typeof child.data.slug === "string") {
          // exclude synthetic index slugs if any were present in content
          if (!child.data.slug.endsWith("/index")) {
            acc.push(child.data)
          }
        }
        if (child?.isFolder) {
          collectDescendantPages(child, acc)
        }
      }
    }

    let allPagesInFolder: QuartzPluginData[] = []
    if (isPostsRoot) {
      const postsFolderNode =
        folder.slugSegment === "posts" ? folder : folder.children.find((child) => child.slugSegment === "posts")

      if (postsFolderNode) {
      // Blog UX: even if files are stored under posts/YYYY/MM/, the posts root should
      // list ALL posts in chronological order (not folder navigation).
        collectDescendantPages(postsFolderNode, allPagesInFolder)
      }
    } else {
      allPagesInFolder =
        folder.children
          .map((node) => {
            // regular file, proceed
            if (node.data) {
              return node.data
            }

            if (node.isFolder && options.showSubfolders) {
              // folders that dont have data need synthetic files
              const getMostRecentDates = (): QuartzPluginData["dates"] => {
                let maybeDates: QuartzPluginData["dates"] | undefined = undefined
                for (const child of node.children) {
                  if (child.data?.dates) {
                    // compare all dates and assign to maybeDates if its more recent or its not set
                    if (!maybeDates) {
                      maybeDates = { ...child.data.dates }
                    } else {
                      if (child.data.dates.created > maybeDates.created) {
                        maybeDates.created = child.data.dates.created
                      }

                      if (child.data.dates.modified > maybeDates.modified) {
                        maybeDates.modified = child.data.dates.modified
                      }

                      if (child.data.dates.published > maybeDates.published) {
                        maybeDates.published = child.data.dates.published
                      }
                    }
                  }
                }
                return (
                  maybeDates ?? {
                    created: new Date(),
                    modified: new Date(),
                    published: new Date(),
                  }
                )
              }

              return {
                slug: node.slug,
                dates: getMostRecentDates(),
                frontmatter: {
                  title: node.displayName,
                  tags: [],
                },
              }
            }
          })
          .filter((page) => page !== undefined) ?? []
    }
    const cssClasses: string[] = fileData.frontmatter?.cssclasses ?? []
    const classes = cssClasses.join(" ")
    const listProps = {
      ...props,
      // For /posts, prefer pure date sort (no "folders first") to get a simple feed.
      sort: isPostsRoot ? byDateAndAlphabetical(cfg) : options.sort,
      allFiles: allPagesInFolder,
    }

    const content = (
      (tree as Root).children.length === 0
        ? fileData.description
        : htmlToJsx(fileData.filePath!, tree)
    ) as ComponentChildren

    return (
      <div class="popover-hint">
        <article class={classes}>{content}</article>
        <div class="page-listing">
          {options.showFolderCount && (
            <p>
              {i18n(cfg.locale).pages.folderContent.itemsUnderFolder({
                count: allPagesInFolder.length,
              })}
            </p>
          )}
          <div>
            <PageList {...listProps} />
          </div>
        </div>
      </div>
    )
  }

  FolderContent.css = concatenateResources(style, PageList.css)
  return FolderContent
}) satisfies QuartzComponentConstructor
