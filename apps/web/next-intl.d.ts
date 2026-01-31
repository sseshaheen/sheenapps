import type { Messages } from './src/types/messages'

declare global {
  // Use type safe message keys with `next-intl`
  interface IntlMessages extends Messages {}
}