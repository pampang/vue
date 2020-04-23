/* @flow */

import { parse } from './parser/index' // parse 很复杂，可最终可以被封装成为一个函数方法，十分优秀。
import { optimize } from './optimizer'
import { generate } from './codegen/index'
import { createCompilerCreator } from './create-compiler'

// `createCompilerCreator` allows creating compilers that use alternative
// parser/optimizer/codegen, e.g the SSR optimizing compiler.
// Here we just export a default compiler using the default parts.
export const createCompiler = createCompilerCreator(function baseCompile (
  template: string,
  options: CompilerOptions
): CompiledResult {

  // 调用 parse 函数将字符串模板(指令、class、style 等)解析成抽象语法树(AST)
  const ast = parse(template.trim(), options)
  if (options.optimize !== false) {
    // 标记 static 静态节点。这样在 update 的时候，diff 会跳过静态节点，从而减少了比较的过程，优化了 patch 的性能
    optimize(ast, options)
  }
  // generate 是将 AST 转化成 render function 字符串的过程，得到结果是 render 的字符串以及 staticRenderFns 字符串。
  const code = generate(ast, options)

  return {
    ast,
    render: code.render, // 以字符串的形式存在，因为真正变成函数的过程是在 compileToFunctions 中使用 new Function() 来完成的
    staticRenderFns: code.staticRenderFns // 以字符串的形式存在，因为真正变成函数的过程是在 compileToFunctions 中使用 new Function() 来完成的
  }
})
