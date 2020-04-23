/* @flow */

import {
  isPreTag,
  mustUseProp,
  isReservedTag,
  getTagNamespace
} from '../util/index'

import modules from './modules/index'
import directives from './directives/index'
import { genStaticKeys } from 'shared/util'
import { isUnaryTag, canBeLeftOpenTag } from './util'

export const baseOptions: CompilerOptions = {
  expectHTML: true,
  modules,
  directives,
  isPreTag, // 通过给定的标签名字检查标签是否是 'pre' 标签。
  isUnaryTag, // 检测给定的标签是否是一元标签。
  mustUseProp, // 检测一个属性在标签中是否要使用 props 进行绑定。
  canBeLeftOpenTag, // 检测一个标签是否是那些虽然不是一元标签，但却可以自己补全并闭合的标签
  isReservedTag, // 检查给定的标签是否是保留的标签
  getTagNamespace, // 获取元素(标签)的命名空间
  staticKeys: genStaticKeys(modules) // 根据编译器选项的 modules 选项生成一个静态键字符串
}

// 最终的返回结果
// {
//   expectHTML: true,
//   modules: [
//     {
//       staticKeys: ['staticClass'],
//       transformNode,
//       genData
//     },
//     {
//       staticKeys: ['staticStyle'],
//       transformNode,
//       genData
//     },
//     {
//       preTransformNode
//     }
//   ],
//   directives: {
//     model: function(){},
//     html: function(){},
//     text: function(){}
//   },
// }