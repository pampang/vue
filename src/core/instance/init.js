/* @flow */

import config from '../config'
import { initProxy } from './proxy'
import { initState } from './state'
import { initRender } from './render'
import { initEvents } from './events'
import { mark, measure } from '../util/perf'
import { initLifecycle, callHook } from './lifecycle'
import { initProvide, initInjections } from './inject'
import { extend, mergeOptions, formatComponentName } from '../util/index'

let uid = 0

export function initMixin (Vue: Class<Component>) {
  // TODO: component 的创建，也会走到这里来吗？
  Vue.prototype._init = function (options?: Object) {
    const vm: Component = this
    // a uid
    // 每个 vm 被创建的时候，都会递增一次
    vm._uid = uid++

    let startTag, endTag
    /* istanbul ignore if */
    // 性能追踪代码，如果设置了 vue.performance = true, 就会在 window.performance api 上看到对应的打点。
    if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
      startTag = `vue-perf-start:${vm._uid}`
      endTag = `vue-perf-end:${vm._uid}`
      mark(startTag)
    }

    // a flag to avoid this being observed
    vm._isVue = true
    // merge options
    if (options && options._isComponent) {
      // optimize internal component instantiation
      // since dynamic options merging is pretty slow, and none of the
      // internal component options needs special treatment.
      initInternalComponent(vm, options)
    } else {
      // 给 vm 做属性初始化
      vm.$options = mergeOptions(
        resolveConstructorOptions(vm.constructor),
        options || {}, // 我们在 new Vue(options) 时传入的
        vm // 如果执行的是 new Vue()，vm 是有值的，那就是创建一个新的 Vue 实例。否则，就是子组件的处理。
      )
    }
    /* istanbul ignore else */
    // 在实例对象 vm 上添加 _renderProxy 属性
    if (process.env.NODE_ENV !== 'production') {
      // 在非生产环境下，利用 proxy 新特性，给用户的调用行为做监听，友好而准确的提示用户他的调用错误
      initProxy(vm)
    } else {
      vm._renderProxy = vm
    }
    // expose real self
    vm._self = vm
    initLifecycle(vm)
    initEvents(vm)
    initRender(vm)
    // 当 beforeCreate 钩子被调用时，所有与 props、methods、data、computed 以及 watch 相关的内容都不能使用，当然了 inject/provide 也是不可用的。
    callHook(vm, 'beforeCreate')
    initInjections(vm) // resolve injections before data/props
    // 初始化 props, methods, data, computed, watch
    initState(vm)
    initProvide(vm) // resolve provide after data/props
    // created 生命周期钩子则恰恰是等待 initInjections、initState 以及 initProvide 执行完毕之后才被调用，所以在 created 钩子中，是完全能够使用以上提到的内容的。
    callHook(vm, 'created')

    /* istanbul ignore if */
    // 性能追踪代码，如果设置了 vue.performance = true, 就会在 window.performance api 上看到对应的打点。
    if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
      vm._name = formatComponentName(vm, false)
      mark(endTag)
      measure(`vue ${vm._name} init`, startTag, endTag)
    }

    // 开始渲染
    // 渲染函数的观察者与进阶的数据响应系统：http://caibaojian.com/vue-design/art/8vue-reactive-dep-watch.html
    if (vm.$options.el) {
      // $mount 方法是在 platforms/web/runtime/index.js 注入到 Vue 中的
      // 另外也出现在 platforms/web/entry-runtime-with-compiler.js 中
      vm.$mount(vm.$options.el)
    }
  }
}

export function initInternalComponent (vm: Component, options: InternalComponentOptions) {
  const opts = vm.$options = Object.create(vm.constructor.options)
  // doing this because it's faster than dynamic enumeration.
  const parentVnode = options._parentVnode
  opts.parent = options.parent
  opts._parentVnode = parentVnode

  const vnodeComponentOptions = parentVnode.componentOptions
  opts.propsData = vnodeComponentOptions.propsData
  opts._parentListeners = vnodeComponentOptions.listeners
  opts._renderChildren = vnodeComponentOptions.children
  opts._componentTag = vnodeComponentOptions.tag

  if (options.render) {
    opts.render = options.render
    opts.staticRenderFns = options.staticRenderFns
  }
}

// resolveConstructorOptions 这个函数的作用永远都是用来获取当前实例构造者的 options 属性的，即使 if 判断分支内也不例外，因为 if 分支只不过是处理了 options，最终返回的永远都是 options。
// 我们可以直接运行 Vue.options 来看到。
/**
 * 默认的 Vue.options 长这样：
 * Vue.options = {
    components: {
      KeepAlive
      Transition,
        TransitionGroup
    },
    directives:{
        model,
          show
    },
    filters: Object.create(null),
    _base: Vue
  }
  */
export function resolveConstructorOptions (Ctor: Class<Component>) {
  let options = Ctor.options
  if (Ctor.super) {
    const superOptions = resolveConstructorOptions(Ctor.super)
    const cachedSuperOptions = Ctor.superOptions
    if (superOptions !== cachedSuperOptions) {
      // super option changed,
      // need to resolve new options.
      Ctor.superOptions = superOptions
      // check if there are any late-modified/attached options (#4976)
      const modifiedOptions = resolveModifiedOptions(Ctor)
      // update base extend options
      if (modifiedOptions) {
        extend(Ctor.extendOptions, modifiedOptions)
      }
      options = Ctor.options = mergeOptions(superOptions, Ctor.extendOptions)
      if (options.name) {
        options.components[options.name] = Ctor
      }
    }
  }
  return options
}

function resolveModifiedOptions (Ctor: Class<Component>): ?Object {
  let modified
  const latest = Ctor.options
  const sealed = Ctor.sealedOptions
  for (const key in latest) {
    if (latest[key] !== sealed[key]) {
      if (!modified) modified = {}
      modified[key] = latest[key]
    }
  }
  return modified
}
