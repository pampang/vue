/* @flow */

import Dep from './dep'
import VNode from '../vdom/vnode'
import { arrayMethods } from './array'
import {
  def,
  warn,
  hasOwn,
  hasProto,
  isObject,
  isPlainObject,
  isPrimitive,
  isUndef,
  isValidArrayIndex,
  isServerRendering
} from '../util/index'

const arrayKeys = Object.getOwnPropertyNames(arrayMethods)

/**
 * In some cases we may want to disable observation inside a component's
 * update computation.
 */
export let shouldObserve: boolean = true

export function toggleObserving (value: boolean) {
  shouldObserve = value
}

/**
 * Observer class that is attached to each observed
 * object. Once attached, the observer converts the target
 * object's property keys into getter/setters that
 * collect dependencies and dispatch updates.
 */
// Observer 的意义：是响应式数据中的 __ob__ 属性，是他让属性变成响应式。
export class Observer {
  value: any;
  dep: Dep;
  vmCount: number; // number of vms that have this object as root $data

  constructor (value: any) {
    this.value = value
    this.dep = new Dep() // 收集依赖的“筐”
    this.vmCount = 0
    def(value, '__ob__', this)

    // 对数组做特殊处理。因为数组不能直接使用 Object.defineProperty，需要通过原生方法劫持的形式来实现。
    // arrayMethods 对所有的原生方法都做了一层封装，让 Vue 可以感知到数组的变化。可以理解为是一个 HOC？
    if (Array.isArray(value)) {
      if (hasProto) {
        // 如果存在 __proto__ 属性，则直接对原型做调整
        protoAugment(value, arrayMethods)
      } else {
        // 兼容 IE11 以下的浏览器，因为他们不存在 __proto__ 属性，需要用直接覆盖的方式
        copyAugment(value, arrayMethods, arrayKeys)
      }
      this.observeArray(value)
    } else {
      this.walk(value)
    }
  }

  /**
   * Walk through all properties and convert them into
   * getter/setters. This method should only be called when
   * value type is Object.
   */
  // 递归处理对象中的对象，全面改造他们的 getter 和 setter
  walk (obj: Object) {
    const keys = Object.keys(obj)
    for (let i = 0; i < keys.length; i++) {
      defineReactive(obj, keys[i])
    }
  }

  /**
   * Observe a list of Array items.
   */
  // 为了使嵌套的数组或对象同样是响应式数据，我们需要递归的观测那些类型为数组或对象的数组元素，而这就是 observeArray 方法的作用
  observeArray (items: Array<any>) {
    // 对每一个值，都做 observe 处理
    for (let i = 0, l = items.length; i < l; i++) {
      observe(items[i])
    }
  }
}

// helpers

/**
 * Augment a target Object or Array by intercepting
 * the prototype chain using __proto__
 */
function protoAugment (target, src: Object) {
  /* eslint-disable no-proto */
  target.__proto__ = src
  /* eslint-enable no-proto */
}

/**
 * Augment a target Object or Array by defining
 * hidden properties.
 */
/* istanbul ignore next */
function copyAugment (target: Object, src: Object, keys: Array<string>) {
  for (let i = 0, l = keys.length; i < l; i++) {
    const key = keys[i]
    def(target, key, src[key])
  }
}

/**
 * Attempt to create an observer instance for a value,
 * returns the new observer if successfully observed,
 * or the existing observer if the value already has one.
 */
export function observe (value: any, asRootData: ?boolean): Observer | void {
  if (!isObject(value) || value instanceof VNode) {
    return
  }
  let ob: Observer | void
  // observe 最终的结果就是在 obj 里面加了一个 __ob__ 属性，如果已经存在了，则说明这个数据不需要再做一次 observe 的处理了。
  if (hasOwn(value, '__ob__') && value.__ob__ instanceof Observer) {
    ob = value.__ob__
  } else if (
    shouldObserve &&
    !isServerRendering() &&
    (Array.isArray(value) || isPlainObject(value)) && // 是数组或对象
    Object.isExtensible(value) && // isExtensible 是为了检查对象本身是否可拓展，如果不行，则不作处理了。
    !value._isVue // 对象本身不是 vue 实例
  ) {
    // 对 value 实现一个 observer，实现响应式
    ob = new Observer(value)
  }
  if (asRootData && ob) {
    ob.vmCount++
  }
  return ob
}

/**
 * Define a reactive property on an Object.
 */
export function defineReactive (
  obj: Object,
  key: string,
  val: any,
  customSetter?: ?Function,
  shallow?: boolean
) {
  const dep = new Dep() // 这个 dep 依赖收集器，被存放在闭包里面的，是属于 obj[key] 的。

  const property = Object.getOwnPropertyDescriptor(obj, key)
  if (property && property.configurable === false) {
    return
  }

  // cater for pre-defined getter/setters
  // 由于接下来会使用 Object.defineProperty 函数重新定义属性的 setter/getter，这会导致属性原有的 set 和 get 方法被覆盖，所以要将属性原有的 setter/getter 缓存，并在重新定义的 set 和 get 方法中调用缓存的函数，从而做到不影响属性的原有读写操作。
  const getter = property && property.get // 提取到该 key 的 get
  const setter = property && property.set // 提取到该 key 的 set
  // 响应式关键在于处理 getter 和 setter。如果开发者已经设定了 getter，为了避免影响，就不作处理了。
  // (!getter || setter)，翻译为：没有 getter 或者已有 setter，对应着两种状态：
  // 1、当属性原本存在 getter 时，是不会触发取值动作的，即 val = obj[key] 不会执行，所以 val 是 undefined，这就导致在后面深度观测的语句中传递给 observe 函数的参数是 undefined。
  // 为什么当属性拥有自己的 getter 时就不会对其深度观测了呢？有两方面的原因，第一：由于当属性存在原本的 getter 时在深度观测之前不会取值，所以在深度观测语句执行之前取不到属性值从而无法深度观测。第二：之所以在深度观测之前不取值是因为属性原本的 getter 由用户定义，用户可能在 getter 中做任何意想不到的事情，这么做是出于避免引发不可预见行为的考虑。
  // 2、如果 vue 自己已经处理了对应的字段，则他应该有 getter 和 setter。经过 defineReactive 函数的处理之后，该属性将被重新定义 getter 和 setter，此时该属性变成了既拥有 get 函数又拥有 set 函数。并且当我们尝试给该属性重新赋值时，那么新的值将会被观测。
  if ((!getter || setter) && arguments.length === 2) {
    val = obj[key]
  }

  // val 本身有可能也是一个对象，那么此时应该继续调用 observe(val) 函数观测该对象从而深度观测数据对象
  let childOb = !shallow && observe(val)
  Object.defineProperty(obj, key, {
    enumerable: true,
    configurable: true,
    // 在 get 函数中如何收集依赖：http://caibaojian.com/vue-design/art/7vue-reactive.html#%E5%9C%A8-get-%E5%87%BD%E6%95%B0%E4%B8%AD%E5%A6%82%E4%BD%95%E6%94%B6%E9%9B%86%E4%BE%9D%E8%B5%96
    get: function reactiveGetter () {
      const value = getter ? getter.call(obj) : val

      // !!!: 一个 getter/setter 的小逻辑。给定 var data123 = { obj : { foo: 1 } };
      // 当我访问 data123.obj.foo 的时候，obj 的 getter 会触发；foo 的 getter 也会触发。
      // 当我设置 data123.obj.foo = 2 的时候，obj 的 setter 会触发；foo 的 setter 也会触发。

      // 收集依赖
      // 第一个”筐“里收集的依赖的触发时机是当属性值被修改时触发，即在 set 函数中触发：dep.notify()
      if (Dep.target) { // Dep.target 中保存的值就是要被收集的依赖(观察者)。例如 watcher 中的传入函数
        dep.depend() // 收集依赖。依赖在 Dep.target 这个位置。

        // TODO: 这里怎么理解？为什么要这样做？
        // 这里收集的依赖的触发时机是在使用 $set 或 Vue.set 给数据对象添加新属性时触发
        // __ob__ 属性以及 __ob__.dep 的主要作用是为了添加、删除属性时有能力触发依赖，而这就是 Vue.set 或 Vue.delete 的原理。
        // 参考文档：在 get 函数中如何收集依赖。http://caibaojian.com/vue-design/art/7vue-reactive.html#%E5%9C%A8-get-%E5%87%BD%E6%95%B0%E4%B8%AD%E5%A6%82%E4%BD%95%E6%94%B6%E9%9B%86%E4%BE%9D%E8%B5%96
        if (childOb) {
          childOb.dep.depend()
          if (Array.isArray(value)) {
            // 数组的索引是非响应式的。因为没办法对数组做如对象那样通过拦截属性来做到精细化控制，所以，我们认为，已登录了数组，就等于依赖了数组内的所有元素，数组内所有元素的改变都可以看做是数组的改变
            dependArray(value)
          }
        }
      }
      return value
    },
    // 在 set 函数中如何触发依赖：http://caibaojian.com/vue-design/art/7vue-reactive.html#%E5%9C%A8-get-%E5%87%BD%E6%95%B0%E4%B8%AD%E5%A6%82%E4%BD%95%E6%94%B6%E9%9B%86%E4%BE%9D%E8%B5%96
    set: function reactiveSetter (newVal) {
      const value = getter ? getter.call(obj) : val
      /* eslint-disable no-self-compare */
      // (newVal !== newVal && value !== value) 是为了判断是不是 NaN
      if (newVal === value || (newVal !== newVal && value !== value)) {
        return
      }
      /* eslint-enable no-self-compare */
      if (process.env.NODE_ENV !== 'production' && customSetter) {
        customSetter()
      }
      // #7981: for accessor properties without setter
      if (getter && !setter) return
      if (setter) {
        setter.call(obj, newVal)
      } else {
        val = newVal
      }
      childOb = !shallow && observe(newVal)
      dep.notify()
    }
  })
}

// FIXME: Vue.set($set) 和 Vue.delete($delete) 的实现：http://caibaojian.com/vue-design/art/7vue-reactive.html#vue-set-set-%E5%92%8C-vue-delete-delete-%E7%9A%84%E5%AE%9E%E7%8E%B0

/**
 * Set a property on an object. Adds the new property and
 * triggers change notification if the property doesn't
 * already exist.
 */
export function set (target: Array<any> | Object, key: any, val: any): any {
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target)) // 是否 undefined 或 原始类型，是则警告
  ) {
    warn(`Cannot set reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }
  if (Array.isArray(target) && isValidArrayIndex(key)) { // 校验 key 是否是有效的数组索引
    target.length = Math.max(target.length, key)
    target.splice(key, 1, val)
    return val
  }
  if (key in target && !(key in Object.prototype)) {
    target[key] = val
    return val
  }
  const ob = (target: any).__ob__
  // 当使用 Vue.set/$set 函数为根数据对象添加属性时，是不被允许的。利用双重判定来做限制。
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid adding reactive properties to a Vue instance or its root $data ' +
      'at runtime - declare it upfront in the data option.'
    )
    return val
  }
  if (!ob) {
    target[key] = val
    return val
  }
  defineReactive(ob.value, key, val)
  // 这里的 ob，是 observe(target) 时创建的。他的 dep，是指向 target 内部的变量。这个指向是在设置 target 的 get 时加上去的依赖：childOb.dep.depend()
  ob.dep.notify()
  return val
}

/**
 * Delete a property and trigger change if necessary.
 */
export function del (target: Array<any> | Object, key: any) {
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(`Cannot delete reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.splice(key, 1)
    return
  }
  const ob = (target: any).__ob__
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid deleting properties on a Vue instance or its root $data ' +
      '- just set it to null.'
    )
    return
  }
  if (!hasOwn(target, key)) {
    return
  }
  delete target[key]
  if (!ob) {
    return
  }
  ob.dep.notify()
}

/**
 * Collect dependencies on array elements when the array is touched, since
 * we cannot intercept array element access like property getters.
 */
function dependArray (value: Array<any>) {
  for (let e, i = 0, l = value.length; i < l; i++) {
    e = value[i]
    e && e.__ob__ && e.__ob__.dep.depend()
    if (Array.isArray(e)) {
      dependArray(e)
    }
  }
}
