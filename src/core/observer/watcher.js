/* @flow */

import {
  warn,
  remove,
  isObject,
  parsePath,
  _Set as Set,
  handleError,
  noop
} from '../util/index'

import { traverse } from './traverse'
import { queueWatcher } from './scheduler'
import Dep, { pushTarget, popTarget } from './dep'

import type { SimpleSet } from '../util/index'

let uid = 0

/**
 * A watcher parses an expression, collects dependencies,
 * and fires callback when the expression value changes.
 * This is used for both the $watch() api and directives.
 */
// Watcher 的原理是通过对“被观测目标”的求值，触发数据属性的 get 拦截器函数从而收集依赖
// 我对于 watcher 的理解：我监听你的 expOrFn 的结果。当你 expOrFn 的结果变化了，我就执行 cb。

// Dep : 一个订阅者的列表类，可以增加或删除订阅者，可以向订阅者发送消息
// Watcher : 订阅者类。它在初始化时可以接受getter, callback两个函数作为参数。getter用来计算Watcher对象的值。当Watcher被触发时，会重新通过getter计算当前Watcher的值，如果值改变，则会执行callback.

// watcher 和 dep 是互相收集的。
// watcher 通过 deps 属性 && addDep 方法，存放 dep。
// dep 通过 subs 属性 && addSubs 方法，存放 watcher。
export default class Watcher {
  vm: Component;
  expression: string;
  cb: Function;
  id: number;
  deep: boolean;
  user: boolean;
  lazy: boolean;
  sync: boolean;
  dirty: boolean;
  active: boolean;
  deps: Array<Dep>;
  newDeps: Array<Dep>;
  depIds: SimpleSet; // depIds 属性用来避免重复求值时收集重复的观察者
  newDepIds: SimpleSet; // newDepIds 属性用来在一次求值中避免收集重复的观察者
  before: ?Function;
  getter: Function;
  value: any;

  constructor (
    vm: Component,
    expOrFn: string | Function, // 要观察的表达式
    cb: Function, // 当被观察的表达式的值变化时的回调函数 cb
    options?: ?Object, // 一些传递给当前观察者对象的选项 options
    isRenderWatcher?: boolean // 标识该观察者实例是否是渲染函数的观察者
  ) {
    // 每一个 watcher 都有一个对应的 vm 实例。该属性指明了这个观察者是属于哪一个组件的
    this.vm = vm
    if (isRenderWatcher) {
      vm._watcher = this // 组件实例的 _watcher 属性的值引用着该组件的渲染函数观察者。_watcher 属性是在 initLifecycle 函数中被初始化的，其初始值为 null。
    }
    // 属于该组件实例的观察者都会被添加到该组件实例对象的 vm._watchers 数组中，包括渲染函数的观察者和非渲染函数的观察者。vm._watchers 属性是在 initState 函数中初始化的，其初始值是一个空数组。
    vm._watchers.push(this)
    // options
    if (options) {
      this.deep = !!options.deep // 用来告诉当前观察者实例对象是否是深度观测。什么叫深度观测呢？
      this.user = !!options.user // 用来标识当前观察者实例对象是 开发者定义的 还是 内部定义的
      this.lazy = !!options.lazy // 是否惰性求值
      this.sync = !!options.sync // 当数据变化时是否同步求值并执行回调
      this.before = options.before // 当数据变化之后，触发更新之前，调用在创建渲染函数的观察者实例对象时传递的 before 选项
    } else {
      this.deep = this.user = this.lazy = this.sync = false
    }
    this.cb = cb
    this.id = ++uid // uid for batching
    this.active = true
    this.dirty = this.lazy // for lazy watchers

    // 用来实现避免收集重复依赖，且移除无用依赖的功能也依赖于它们
    this.deps = []
    this.newDeps = []
    this.depIds = new Set()
    this.newDepIds = new Set()

    // 是在非生产环境下使用的
    this.expression = process.env.NODE_ENV !== 'production'
      ? expOrFn.toString()
      : ''

    // parse expression for getter
    // 统一处理 watcher 的 getter，也就是获取比对值的逻辑。它最终必然是一个方法，返回需要比对的值。
    if (typeof expOrFn === 'function') {
      this.getter = expOrFn
    } else {
      this.getter = parsePath(expOrFn)
      if (!this.getter) {
        this.getter = noop
        process.env.NODE_ENV !== 'production' && warn(
          `Failed watching path: "${expOrFn}" ` +
          'Watcher only accepts simple dot-delimited paths. ' +
          'For full control, use a function instead.',
          vm
        )
      }
    }

    // 除惰性求值之外的所有观察者实例对象都将执行如上代码的 else 分支语句，即调用 this.get() 方法
    // 换句话说，惰性求值的意思，就是把求值的时机延后
    this.value = this.lazy
      ? undefined
      : this.get()
  }

  /**
   * Evaluate the getter, and re-collect dependencies.
   */
  // 每一次 watcher 求值，都会重新收集依赖。
  // TODO: 我还不知道 watcher 在整个链条中的具体位置和作用。
  // 什么时候会新建一个 watcher？什么时候会触发 watcher 的 get？为什么要重新收集依赖？
  get () {
    pushTarget(this) // 把当前 watcher 实例，放入到 Dep.target 中，让 Dep.target 有值，这样 defineReactive 中的 getter 才能顺利执行。
    let value
    const vm = this.vm
    try {
      // 调用了 defineReactive 中的 getter，他会把当前的 Dep.target 收入到 dep 中。
      // 这个 getter 会：触发依赖收集逻辑，让 dep 开始收集依赖，把当前 watcher 实例放入到 dep 队列中，同时 watcher 把 dep 保存下来
      // watcher 中的 addDep 会利用 newDeps 来帮助我们避免重复收集。
      value = this.getter.call(vm, vm)
    } catch (e) {
      if (this.user) {
        handleError(e, vm, `getter for watcher "${this.expression}"`)
      } else {
        throw e
      }
    } finally {
      // "touch" every property so they are all tracked as
      // dependencies for deep watching
      if (this.deep) {
        traverse(value)
      }
      popTarget()
      // 每一次 get 走完，都会清空 newDepIds 属性以及 newDeps 属性的值
      this.cleanupDeps()
    }
    return value
  }

  /**
   * Add a dependency to this directive.
   */
  // 在 dep 中，执行了 dep.depend() 后，被调用。
  addDep (dep: Dep) {
    const id = dep.id // Dep 实例对象的唯一 id 值
    // 避免收集重复依赖
    /**
    TODO: !!!important
    这里要着重讲一下，重复依赖是什么，该怎么避免。
    形如下面的模板：
    <template>
      <div id="demo">
        {{name}}{{name}}
      </div>
      <p>
        {{name}}
      </p>
    </template>
    如果没有收集时没有重复依赖的判断，那么在 name 的 dep 中，渲染函数 watcher 会被收集两次。(实际上，渲染函数 watcher，是对整个 template 生效的。)
    为了避免多次收集重复的 watcher，于是做了下面的判断。
     */

    // newDepIds 属性用来避免在 一次求值 的过程中收集重复的依赖，其实 depIds 属性是用来在 多次求值 中避免收集重复依赖的
    // 每一次求值之后 newDepIds 属性都会被清空，也就是说每次重新求值的时候对于观察者实例对象来讲 newDepIds 属性始终是全新的。
    // 虽然每次求值之后会清空 newDepIds 属性的值，但在清空之前会把 newDepIds 属性的值以及 newDeps 属性的值赋值给 depIds 属性和 deps 属性，这样重新求值的时候 depIds 属性和 deps 属性将会保存着上一次求值中 newDepIds 属性以及 newDeps 属性的值。
    if (!this.newDepIds.has(id)) {
      this.newDepIds.add(id)
      this.newDeps.push(dep)
      if (!this.depIds.has(id)) {
        // 把 wathcer 放到 dep.subs 中。
        dep.addSub(this)
      }
    }
  }

  /**
   * Clean up for dependency collection.
   */
  // 每次求值并收集观察者完成之后会清空 newDepIds 和 newDeps 这两个属性的值，并且在被清空之前把值分别赋给了 depIds 属性和 deps 属性
  // 为什么是赋值替换，而不是 push？
  // 例如 template 函数，每一次运行之后，getter 都会跑一遍，那么新的依赖都会收集完了。旧的依赖完全没意义了。于是直接替代就好了。
  cleanupDeps () {
    let i = this.deps.length
    while (i--) {
      const dep = this.deps[i]
      // 去掉 dep 中
      if (!this.newDepIds.has(dep.id)) {
        dep.removeSub(this)
      }
    }
    let tmp = this.depIds
    this.depIds = this.newDepIds
    this.newDepIds = tmp
    this.newDepIds.clear()
    tmp = this.deps
    this.deps = this.newDeps
    this.newDeps = tmp
    this.newDeps.length = 0
  }

  /**
   * Subscriber interface.
   * Will be called when a dependency changes.
   */
  // 无论是同步更新变化还是将更新变化的操作放到异步更新队列，真正的更新变化操作都是通过调用观察者实例对象的 run 方法完成的
  update () {
    /* istanbul ignore else */
    if (this.lazy) { // 给 computed 属性用的
      // this.dirty 属性也是为计算属性准备的，由于计算属性是惰性求值，所以在实例化计算属性的时候 this.dirty 的值会被设置为 true，代表着还没有求值，后面当真正对计算属性求值时，也就是执行如上代码时才会将 this.dirty 设置为 false，代表着已经求过值了。
      this.dirty = true
    } else if (this.sync) {
      this.run()
    } else {
      // 将当前观察者对象放到一个异步更新队列，这个队列会在调用栈被清空之后按照一定的顺序执行
      queueWatcher(this)
    }
  }

  /**
   * Scheduler job interface.
   * Will be called by the scheduler.
   */
  run () {
    if (this.active) {
      // 对于渲染函数的观察者来讲，重新求值其实等价于重新执行渲染函数，最终结果就是重新生成了虚拟DOM并更新真实DOM，这样就完成了重新渲染的过程
      // 对于其他观察者，则需要走下面的流程
      const value = this.get()
      if (
        value !== this.value ||
        // Deep watchers and watchers on Object/Arrays should fire even
        // when the value is the same, because the value may
        // have mutated.
        isObject(value) ||
        this.deep
      ) {
        // set new value
        const oldValue = this.value
        this.value = value
        if (this.user) {
          try {
            this.cb.call(this.vm, value, oldValue)
          } catch (e) {
            handleError(e, this.vm, `callback for watcher "${this.expression}"`)
          }
        } else {
          this.cb.call(this.vm, value, oldValue)
        }
      }
    }
  }

  /**
   * Evaluate the value of the watcher.
   * This only gets called for lazy watchers.
   */
  evaluate () {
    this.value = this.get()
    this.dirty = false
  }

  /**
   * Depend on all deps collected by this watcher.
   */
  depend () {
    let i = this.deps.length
    while (i--) {
      this.deps[i].depend()
    }
  }

  /**
   * Remove self from all dependencies' subscriber list.
   */
  teardown () {
    if (this.active) {
      // remove self from vm's watcher list
      // this is a somewhat expensive operation so we skip it
      // if the vm is being destroyed.
      if (!this.vm._isBeingDestroyed) {
        remove(this.vm._watchers, this)
      }
      let i = this.deps.length
      while (i--) {
        this.deps[i].removeSub(this)
      }
      this.active = false
    }
  }
}
