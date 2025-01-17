/**
 * Not type-checking this file because it's mostly vendor code.
 */

/*!
 * HTML Parser By John Resig (ejohn.org)
 * Modified by Juriy "kangax" Zaytsev
 * Original code by Erik Arvidsson (MPL-1.1 OR Apache-2.0 OR GPL-2.0-or-later)
 * http://erik.eae.net/simplehtmlparser/simplehtmlparser.js
 */

import { makeMap, no } from 'shared/util'
import { isNonPhrasingTag } from 'web/compiler/util'
import { unicodeRegExp } from 'core/util/lang'

// Regular Expressions for parsing tags and attributes
/**
 * 匹配属性，包括：
 * 1、使用双引号把值引起来：class="some-class"
 * 2、使用单引号把值引起来：class='some-class'
 * 3、不使用引号：class=some-class
 * 4、单独的属性名：disabled
 * 这里一共有 5 个捕获组，看得我头晕眼花。
 */
const attribute = /^\s*([^\s"'<>\/=]+)(?:\s*(=)\s*(?:"([^"]*)"+|'([^']*)'+|([^\s"'=<>`]+)))?/
const dynamicArgAttribute = /^\s*((?:v-[\w-]+:|@|:|#)\[[^=]+\][^\s"'<>\/=]*)(?:\s*(=)\s*(?:"([^"]*)"+|'([^']*)'+|([^\s"'=<>`]+)))?/

// --- 对 xml 中的 name、tag 做了定义。
// ncname 的全称是 An XML name that does not contain a colon (:) 即：不包含冒号(:)的 XML 名称。也就是说 ncname 就是不包含前缀的XML标签名称。大家可以在这里找到关于 ncname 的概念。
// 同类的还有 qname。
const ncname = `[a-zA-Z_][\\-\\.0-9_a-zA-Z${unicodeRegExp.source}]*`
// qname 实际上就是合法的标签名称，它是由可选项的 前缀、冒号 以及 名称 组成，观察 qnameCapture 可知它有一个捕获分组，捕获的内容就是整个 qname 名称，即整个标签的名称。
const qnameCapture = `((?:${ncname}\\:)?${ncname})`
// 用来匹配开始标签的一部分
const startTagOpen = new RegExp(`^<${qnameCapture}`)
// 用来开始标签的闭合部分，包括： /> 和 >
const startTagClose = /^\s*(\/?)>/
// 用来匹配结束标签
const endTag = new RegExp(`^<\\/${qnameCapture}[^>]*>`)
// 用来匹配文档的 DOCTYPE 标签，没有捕获组。
const doctype = /^<!DOCTYPE [^>]+>/i
// #7298: escape - to avoid being passed as HTML comment when inlined in page
// 用来匹配注释节点，没有捕获组
const comment = /^<!\--/
// 用来匹配条件注释节点，没有捕获组
const conditionalComment = /^<!\[/

// Special Elements (can contain anything)
export const isPlainTextElement = makeMap('script,style,textarea', true)
const reCache = {}

// --- 服务 shouldDecodeNewlines 和 shouldDecodeNewlinesForHref 这两个编译器选项
// http://caibaojian.com/vue-design/appendix/web-util.html#compat-js-%E6%96%87%E4%BB%B6
const decodingMap = {
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&amp;': '&',
  '&#10;': '\n',
  '&#9;': '\t',
  '&#39;': "'"
}
const encodedAttr = /&(?:lt|gt|quot|amp|#39);/g
const encodedAttrWithNewLines = /&(?:lt|gt|quot|amp|#39|#10|#9);/g

// #5992
// <pre> 标签和 <textarea> 会忽略其内容的第一个换行符
const isIgnoreNewlineTag = makeMap('pre,textarea', true)
const shouldIgnoreFirstNewline = (tag, html) => tag && isIgnoreNewlineTag(tag) && html[0] === '\n'
// decodeAttr 函数是用来解码 html 实体的
function decodeAttr (value, shouldDecodeNewlines) {
  const re = shouldDecodeNewlines ? encodedAttrWithNewLines : encodedAttr
  return value.replace(re, match => decodingMap[match])
}

// html 字符串作为字符输入流，并且按照一定的规则将其逐步消化分解
// 一个问题：如何判断一个非一元标签是否缺少结束标签
export function parseHTML (html, options) {
  const stack = []
  const expectHTML = options.expectHTML
  const isUnaryTag = options.isUnaryTag || no // 用来检测一个标签是否是一元标签
  const canBeLeftOpenTag = options.canBeLeftOpenTag || no // 检测一个标签是否是可以省略闭合标签的非一元标签
  let index = 0 // 标识着当前字符流的读入位置
  let last, lastTag // 变量 last 存储剩余还未 parse 的 html 字符串，变量 lastTag 则始终存储着位于 stack 栈顶的元素。

  // 开启一个 while 循环，循环结束的条件是 html 为空，即 html 被 parse 完毕
  // 递归处理标签，用 stack 来存储还未闭合的标签。
  while (html) {
    last = html
    // Make sure we're not in a plaintext content element like script/style
    // / 确保即将 parse 的内容不是在纯文本标签里 (script,style,textarea)
    if (!lastTag || !isPlainTextElement(lastTag)) {
      let textEnd = html.indexOf('<')
      // 如果存在 <
      if (textEnd === 0) {
        // Comment:
        // 如果是注释，如 <!-- -->
        if (comment.test(html)) {
          const commentEnd = html.indexOf('-->')

          if (commentEnd >= 0) {
            if (options.shouldKeepComment) {
              options.comment(html.substring(4, commentEnd), index, index + commentEnd + 3)
            }
            advance(commentEnd + 3) // 同时会推进 index
            continue
          }
        }

        // http://en.wikipedia.org/wiki/Conditional_comment#Downlevel-revealed_conditional_comment
        // 如果是条件注释节点，如 <![ ]>
        if (conditionalComment.test(html)) {
          const conditionalEnd = html.indexOf(']>')

          if (conditionalEnd >= 0) {
            advance(conditionalEnd + 2)
            continue
          }
        }

        // Doctype:
        // 如果是 Doctype 节点，如 <!DOCTYPE >
        const doctypeMatch = html.match(doctype)
        if (doctypeMatch) {
          advance(doctypeMatch[0].length)
          continue
        }

        // End tag:
        // 如果是结束标签 </XX>
        const endTagMatch = html.match(endTag)
        if (endTagMatch) {
          const curIndex = index
          advance(endTagMatch[0].length)
          parseEndTag(endTagMatch[1], curIndex, index) // 处理结尾，让需要出栈的元素出栈。
          continue
        }

        // Start tag:
        // 如果是开始标签 <XX>
        const startTagMatch = parseStartTag() // 如果存在返回值则说明开始标签解析成功
        if (startTagMatch) {
          handleStartTag(startTagMatch)
          if (shouldIgnoreFirstNewline(startTagMatch.tagName, html)) {
            advance(1)
          }
          continue
        }
      }

      // 如果 html 被处理成是 text</div>，这是会把 text 提取出来，当做字符串。
      let text, rest, next
      if (textEnd >= 0) {
        rest = html.slice(textEnd)
        // 特殊情况：如果 html 是如 0<1<2 的内容，命中了下面的多重判断，则会把 <1<2 部分也切出来，当做是 text 返回
        while (
          !endTag.test(rest) &&
          !startTagOpen.test(rest) &&
          !comment.test(rest) &&
          !conditionalComment.test(rest)
        ) {
          // < in plain text, be forgiving and treat it as text
          next = rest.indexOf('<', 1)
          if (next < 0) break
          textEnd += next
          rest = html.slice(textEnd)
        }
        text = html.substring(0, textEnd)
      }

      // 将整个 html 字符串作为文本处理就好了
      if (textEnd < 0) {
        text = html
      }

      if (text) {
        advance(text.length)
      }

      if (options.chars && text) {
        options.chars(text, index - text.length, index)
      }
    // 即将 parse 的内容是在纯文本标签里 (script,style,textarea)
    } else {
      // 用来处理纯文本标签内的内容的，什么是纯文本标签呢？根据 isPlainTextElement 函数可知纯文本标签包括 script 标签、style 标签以及 textarea 标签。
      let endTagLength = 0
      const stackedTag = lastTag.toLowerCase()
      // *?，其代表懒惰模式，也就是说只要第二个分组的内容匹配成功就立刻停止匹
      const reStackedTag = reCache[stackedTag] || (reCache[stackedTag] = new RegExp('([\\s\\S]*?)(</' + stackedTag + '[^>]*>)', 'i'))
      const rest = html.replace(reStackedTag, function (all, text, endTag) {
        endTagLength = endTag.length
        if (!isPlainTextElement(stackedTag) && stackedTag !== 'noscript') {
          text = text
            .replace(/<!\--([\s\S]*?)-->/g, '$1') // #7298
            .replace(/<!\[CDATA\[([\s\S]*?)]]>/g, '$1')
        }
        if (shouldIgnoreFirstNewline(stackedTag, text)) {
          text = text.slice(1)
        }
        if (options.chars) {
          options.chars(text)
        }
        return ''
      })
      index += html.length - rest.length
      html = rest
      parseEndTag(stackedTag, index - endTagLength, index)
    }

    // 将整个字符串作为文本对待。
    // 如果两者相等，则说明字符串 html 在经历循环体的代码之后没有任何改变，此时会把 html 字符串作为纯文本对待
    if (html === last) {
      options.chars && options.chars(html)
      // 打印警告信息，提示你 html 字符串的结尾不符合标签格式，如 <div></div><a
      if (process.env.NODE_ENV !== 'production' && !stack.length && options.warn) {
        options.warn(`Mal-formatted tag at end of template: "${html}"`, { start: index + html.length })
      }
      break
    }
  }

  // Clean up any remaining tags
  // 调用 parseEndTag 函数
  parseEndTag()

  function advance (n) {
    index += n
    html = html.substring(n)
  }
  // parseStartTag 函数用来 parse 开始标签
  function parseStartTag () {
    const start = html.match(startTagOpen) // 如 <div></div>，start = ['<div', 'div']
    if (start) {
      const match = {
        tagName: start[1],
        attrs: [],
        start: index
      }
      advance(start[0].length)
      let end, attr
      // 没有匹配到开始标签的结束部分，并且匹配到了开始标签中的属性，这个时候循环体将被执行，直到遇到开始标签的结束部分为止。
      // attr 会放入匹配后的属性
      while (!(end = html.match(startTagClose)) && (attr = html.match(dynamicArgAttribute) || html.match(attribute))) {
        attr.start = index
        advance(attr[0].length)
        attr.end = index
        match.attrs.push(attr)
      }
      // 判断结束部分为 > 或者 />
      if (end) {
        match.unarySlash = end[1] // 如果 end[1] 不为 undefined，那么说明该标签是一个一元标签
        advance(end[0].length)
        match.end = index
        return match
      }
    }
  }
  // handleStartTag 函数用来处理 parseStartTag 的结果
  function handleStartTag (match) {
    const tagName = match.tagName
    const unarySlash = match.unarySlash

    if (expectHTML) {
      if (lastTag === 'p' && isNonPhrasingTag(tagName)) {
        parseEndTag(lastTag)
      }
      if (canBeLeftOpenTag(tagName) && lastTag === tagName) {
        parseEndTag(tagName)
      }
    }

    const unary = isUnaryTag(tagName) || !!unarySlash

    // 规范 attrs 列表
    const l = match.attrs.length
    const attrs = new Array(l)
    for (let i = 0; i < l; i++) {
      const args = match.attrs[i]
      const value = args[3] || args[4] || args[5] || ''
      const shouldDecodeNewlines = tagName === 'a' && args[1] === 'href'
        ? options.shouldDecodeNewlinesForHref
        : options.shouldDecodeNewlines
      attrs[i] = {
        name: args[1],
        value: decodeAttr(value, shouldDecodeNewlines)
      }
      if (process.env.NODE_ENV !== 'production' && options.outputSourceRange) {
        attrs[i].start = args.start + args[0].match(/^\s*/).length
        attrs[i].end = args.end
      }
    }

    // 如果开始标签是非一元标签，则将该开始标签的信息入栈，即 push 到 stack 数组中，并将 lastTag 的值设置为该标签名
    if (!unary) {
      stack.push({ tag: tagName, lowerCasedTag: tagName.toLowerCase(), attrs: attrs, start: match.start, end: match.end })
      lastTag = tagName
    }

    if (options.start) {
      options.start(tagName, attrs, unary, match.start, match.end)
    }
  }
  // parseEndTag 函数用来 parse 结束标签
  // 三个作用：
  // 检测是否缺少闭合标签（当三个参数都传递）
  // 处理 stack 栈中剩余的标签（当只传递第一个参数）
  // 解析 </br> 与 </p> 标签，与浏览器的行为相同（当不传递参数）
  function parseEndTag (tagName, start, end) {
    let pos, lowerCasedTagName
    if (start == null) start = index
    if (end == null) end = index

    // Find the closest opened tag of the same type
    if (tagName) {
      lowerCasedTagName = tagName.toLowerCase()
      for (pos = stack.length - 1; pos >= 0; pos--) {
        if (stack[pos].lowerCasedTag === lowerCasedTagName) {
          break
        }
      }
    } else {
      // If no tag name is provided, clean shop
      // pos 变量会被用来判断是否有元素缺少闭合标签
      pos = 0
    }

    if (pos >= 0) {
      // Close all the open elements, up the stack
      for (let i = stack.length - 1; i >= pos; i--) {
        // 如果没有在栈里找到匹配的元素，给友好提示
        if (process.env.NODE_ENV !== 'production' &&
          (i > pos || !tagName) &&
          options.warn
        ) {
          options.warn(
            `tag <${stack[i].tag}> has no matching end tag.`,
            { start: stack[i].start, end: stack[i].end }
          )
        }
        if (options.end) {
          options.end(stack[i].tag, start, end)
        }
      }

      // Remove the open elements from the stack
      // </br> </p>
      stack.length = pos
      lastTag = pos && stack[pos - 1].tag
    } else if (lowerCasedTagName === 'br') {
      if (options.start) {
        options.start(tagName, [], true, start, end)
      }
    } else if (lowerCasedTagName === 'p') {
      if (options.start) {
        options.start(tagName, [], false, start, end)
      }
      if (options.end) {
        options.end(tagName, start, end)
      }
    }
  }
}
