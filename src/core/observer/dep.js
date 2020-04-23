/* @flow */

import type Watcher from './watcher'
import { remove } from '../util/index'
import config from '../config'

let uid = 0

/**
 * A dep is an observable that can have multiple
 * directives subscribing to it.
 */
// dep 里面放的就是 watcher 吗？dep 和 watcher 是互相配合的吗？——是的
// watcher 和 dep 是互相收集的。
// watcher 通过 deps 属性 && addDep 方法，存放 dep。
// dep 通过 subs 属性 && addSubs 方法，存放 watcher。
export default class Dep {
  static target: ?Watcher; // 这里写明了 target 一定是 watcher。
  id: number;
  subs: Array<Watcher>; // 这里的 subs，存放的是 watcher 数组。

  constructor () {
    this.id = uid++
    this.subs = []
  }

  // dep 实例中真正用来收集观察者的方法，并且收集到的观察者都会被添加到 subs 数组中存起来。
  // 他是在由 watcher 触发的。
  addSub (sub: Watcher) {
    this.subs.push(sub)
  }

  removeSub (sub: Watcher) {
    remove(this.subs, sub)
  }

  depend () {
    if (Dep.target) {
      // 方法内部其实并没有真正的执行收集依赖的动作，
      // 而是调用了观察者实例对象的 addDep 方法：Dep.target.addDep(this)，并以当前 Dep 实例对象作为参数
      // 这里的 addDep，是在 watcher 中声明的方法
      Dep.target.addDep(this)
    }
  }

  notify () {
    // stabilize the subscriber list first
    const subs = this.subs.slice()
    if (process.env.NODE_ENV !== 'production' && !config.async) {
      // subs aren't sorted in scheduler if not running async
      // we need to sort them now to make sure they fire in correct
      // order
      subs.sort((a, b) => a.id - b.id)
    }
    for (let i = 0, l = subs.length; i < l; i++) {
      subs[i].update()
    }
  }
}

// The current target watcher being evaluated.
// This is globally unique because only one watcher
// can be evaluated at a time.
Dep.target = null
const targetStack = []

// pushTarget 函数的作用就是用来为 Dep.target 属性赋值的，pushTarget 函数会将接收到的参数赋值给 Dep.target 属性，我们知道传递给 pushTarget 函数的参数就是调用该函数的观察者对象，所以 Dep.target 保存着一个观察者对象，其实这个观察者对象就是即将要收集的目标。
export function pushTarget (target: ?Watcher) {
  targetStack.push(target)
  Dep.target = target
}

export function popTarget () {
  targetStack.pop()
  Dep.target = targetStack[targetStack.length - 1]
}
