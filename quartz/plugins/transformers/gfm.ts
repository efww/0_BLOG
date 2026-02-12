import remarkGfm from "remark-gfm"
import smartypants from "remark-smartypants"
import { QuartzTransformerPlugin } from "../types"
import rehypeSlug from "rehype-slug"
import rehypeAutolinkHeadings from "rehype-autolink-headings"
import { visit } from "unist-util-visit"

export interface Options {
  enableSmartyPants: boolean
  linkHeadings: boolean
}

const defaultOptions: Options = {
  enableSmartyPants: true,
  linkHeadings: true,
}

/**
 * Quartz는 `remark-gfm`을 통해 GFM 파싱을 켜고 있습니다.
 * 그런데 `remark-gfm` 기본값은 `~text~`(single tilde)도 취소선으로 파싱합니다.
 * 블로그 컨텐츠에서는 `~`가 다른 목적으로 자주 등장해서 의도치 않은 <del>이 발생할 수 있어
 * 1) single tilde 취소선 파싱을 끄고
 * 2) 혹시 생기는 delete 노드(~~text~~)도 그대로 텍스트로 보이도록 되돌립니다.
 */
function remarkDisableStrikethrough() {
  return (tree: any) => {
    const matches: Array<{ parent: any; index: number; children: any[] }> = []

    visit(tree, "delete", (node: any, index: any, parent: any) => {
      if (!parent || typeof index !== "number") return
      if (!Array.isArray(parent.children)) return
      matches.push({ parent, index, children: Array.isArray(node.children) ? node.children : [] })
    })

    // 인덱스 변형을 피하려고 뒤에서부터 splice
    for (const { parent, index, children } of matches.reverse()) {
      parent.children.splice(
        index,
        1,
        { type: "text", value: "~~" },
        ...children,
        { type: "text", value: "~~" },
      )
    }
  }
}

export const GitHubFlavoredMarkdown: QuartzTransformerPlugin<Partial<Options>> = (userOpts) => {
  const opts = { ...defaultOptions, ...userOpts }
  return {
    name: "GitHubFlavoredMarkdown",
    textTransform(_ctx, src) {
      const applyOutsideFences = (input: string, fn: (s: string) => string) => {
        // fenced code block(```) 내부는 원문을 보존해야 하므로 변환을 적용하지 않습니다.
        const lines = input.split("\n")
        let inFence = false
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]
          if (/^\s*```/.test(line)) {
            inFence = !inFence
            continue
          }
          if (!inFence) lines[i] = fn(line)
        }
        return lines.join("\n")
      }

      // `** '텍스트' **` 같이 LLM/편집기에서 별표와 따옴표 사이에 공백이 섞이면
      // strong 파싱이 깨져서 `**`가 그대로 노출될 수 있습니다.
      // 따옴표 바로 안쪽 공백만 제거해서 `**'텍스트'**`로 정규화합니다.
      src = applyOutsideFences(src, (s) => s.replace(/\*\*\s+(['"“”‘’])/g, "**$1"))
      src = applyOutsideFences(src, (s) => s.replace(/(['"“”‘’])\s+\*\*/g, "$1**"))

      // Markdown 파서(micromark)는 `**'텍스트'**인` / `**‘텍스트’**이다`처럼
      // 굵게 감싼 구문이 따옴표로 끝나고, 바로 다음 글자가 문자(공백 없음)로 이어지면
      // strong을 만들지 못하고 `**`를 그대로 텍스트로 남깁니다.
      // 이 케이스는 의도대로 bold가 되게, 해당 패턴만 HTML <strong>으로 치환합니다.
      // (Quartz는 rehype-raw를 켜고 있어서 이 인라인 HTML은 정상적으로 element로 파싱됩니다.)
      src = applyOutsideFences(src, (s) =>
        s.replace(
        /\*\*(['"“”‘’])([^*\n]+?)(['"“”‘’])\*\*(?=[\p{L}\p{N}])/gu,
        (_m, q1: string, inner: string, q2: string) => `<strong>${q1}${inner}${q2}</strong>`,
        ),
      )

      // `**24%**를`, `**(2025)**부터`처럼 굵게 감싼 구문이 기호로 끝나고
      // 조사/접미사가 바로 붙는 케이스도 strong 파싱이 깨지는 경우가 있어 동일하게 보정합니다.
      // (한글은 보통 공백을 두지 않아서 실제 컨텐츠에서 빈번히 발생합니다.)
      src = applyOutsideFences(src, (s) =>
        s.replace(
        /\*\*([^*\n]+?[%'"“”‘’)\]\}])\*\*(?=[\p{L}\p{N}])/gu,
        (_m, inner: string) => `<strong>${inner}</strong>`,
        ),
      )
      return src
    },
    markdownPlugins() {
      // PluggableList는 mutable tuple을 기대해서 `as const`/readonly를 피합니다.
      const plugins: any[] = opts.enableSmartyPants
        ? [[remarkGfm, { singleTilde: false }], smartypants]
        : [[remarkGfm, { singleTilde: false }]]
      plugins.push(remarkDisableStrikethrough)
      return plugins
    },
    htmlPlugins() {
      if (opts.linkHeadings) {
        return [
          rehypeSlug,
          [
            rehypeAutolinkHeadings,
            {
              behavior: "append",
              properties: {
                role: "anchor",
                ariaHidden: true,
                tabIndex: -1,
                "data-no-popover": true,
              },
              content: {
                type: "element",
                tagName: "svg",
                properties: {
                  width: 18,
                  height: 18,
                  viewBox: "0 0 24 24",
                  fill: "none",
                  stroke: "currentColor",
                  "stroke-width": "2",
                  "stroke-linecap": "round",
                  "stroke-linejoin": "round",
                },
                children: [
                  {
                    type: "element",
                    tagName: "path",
                    properties: {
                      d: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71",
                    },
                    children: [],
                  },
                  {
                    type: "element",
                    tagName: "path",
                    properties: {
                      d: "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
                    },
                    children: [],
                  },
                ],
              },
            },
          ],
        ]
      } else {
        return []
      }
    },
  }
}
