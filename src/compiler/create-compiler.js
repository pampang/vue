/* @flow */

import { extend } from 'shared/util'
import { detectErrors } from './error-detector'
import { createCompileToFunctionFn } from './to-function'

// '编译器创建者' 的创建者
// 封装一个叫做 createCompilerCreator 函数，把 compiler 中通用的代码封装起来
// 这样我们就可以使用 createCompilerCreator 函数创建出针对于不同平台的编译器，例如 web 和 weex
// 其中，baseCompile 是特定的平台下特定的编译逻辑。但除此之外，其他逻辑都是通用的。
// 设计模式的核心思想：封装变化。这里的 creator，就是用来封装变化的。
/**
 * 举个栗子：如下面的代码。
// 创建 web 平台的编译器
const webCompiler = createCompilerCreator(function baseCompile (template, options) {
  const ast = parse(template.trim(), options)
  const code = generate(ast, options)
  return code
})

// 创建其他平台的编译器
const otherCompiler = createCompilerCreator(function baseCompile (template, options) {
  const ast = parse(template.trim(), options)
  const code = otherGenerate(ast, options)
  return code
})
 */
export function createCompilerCreator (baseCompile: Function): Function {
  return function createCompiler (baseOptions: CompilerOptions) {
    // 在闭包里面定义函数，就可以直接获取闭包内的变量，而不必传入了。
    /**
     * compile 函数有三个作用：
     * 1、生成最终编译器选项 finalOptions
     * 2、对错误的收集
     * 3、调用 baseCompile 编译模板
     */
    function compile (
      template: string,
      options?: CompilerOptions
    ): CompiledResult {

      // 以 baseOptions 为原型创建 finalOptions 常量
      // 这里的 baseOptions 是在 compiler/index.js 中传入的，里面有很多内容。
      const finalOptions = Object.create(baseOptions)
      const errors = []
      const tips = []

      // 在编译过程中的错误和提示收集
      let warn = (msg, range, tip) => {
        (tip ? tips : errors).push(msg)
      }

      if (options) {
        if (process.env.NODE_ENV !== 'production' && options.outputSourceRange) {
          // $flow-disable-line
          const leadingSpaceLength = template.match(/^\s*/)[0].length

          // 在非生产环境下，再次增强 warn，让他对开发者更友好。
          warn = (msg, range, tip) => {
            const data: WarningMessage = { msg }
            if (range) {
              if (range.start != null) {
                data.start = range.start + leadingSpaceLength
              }
              if (range.end != null) {
                data.end = range.end + leadingSpaceLength
              }
            }
            (tip ? tips : errors).push(data)
          }
        }

        // merge custom modules
        // 这里的 modules 是什么来的呢？
        if (options.modules) {
          finalOptions.modules =
            (baseOptions.modules || []).concat(options.modules)
        }

        // merge custom directives
        // 合并自定义指令。从哪里传进来的？
        if (options.directives) {
          finalOptions.directives = extend(
            Object.create(baseOptions.directives || null),
            options.directives
          )
        }
        // copy other options
        for (const key in options) {
          if (key !== 'modules' && key !== 'directives') {
            finalOptions[key] = options[key]
          }
        }
      }

      finalOptions.warn = warn

      // 这句才是主角
      const compiled = baseCompile(template.trim(), finalOptions)

      if (process.env.NODE_ENV !== 'production') {
        detectErrors(compiled.ast, warn)
      }
      compiled.errors = errors
      compiled.tips = tips
      return compiled
    }

    return {
      compile,
      compileToFunctions: createCompileToFunctionFn(compile)
    }
  }
}
