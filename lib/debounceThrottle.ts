import { debounce, throttle } from 'lodash'

export function debounced<T extends (...args: Parameters<T>) => void>(fn: T, wait = 400) {
  return debounce(fn, wait)
}

export function throttled<T extends (...args: Parameters<T>) => void>(fn: T, wait = 200) {
  return throttle(fn, wait, { leading: true, trailing: true })
}
