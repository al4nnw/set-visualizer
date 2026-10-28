import { describe, expect, it } from 'vitest'
import { en } from '../src/renderer/src/i18n/en'
import { es } from '../src/renderer/src/i18n/es'
import { ptBR } from '../src/renderer/src/i18n/pt-BR'

const flat = (o: object, pre = ''): Record<string, string> =>
  Object.assign({}, ...Object.entries(o).map(([k, v]) => (typeof v === 'string' ? { [pre + k]: v } : flat(v, `${pre}${k}.`))))
const slots = (s: string) => [...s.matchAll(/\{\{(\w+)\}\}|<(\d)>/g)].map((m) => m[1] ?? `<${m[2]}>`).sort()

describe('UI catalogs', () => {
  const base = flat(en)
  for (const [name, cat] of [['pt-BR', ptBR], ['es', es]] as const) {
    it(`${name} has every key, with the same placeholders`, () => {
      const c = flat(cat)
      expect(Object.keys(c).sort()).toEqual(Object.keys(base).sort())
      for (const k of Object.keys(base)) expect(slots(c[k]), k).toEqual(slots(base[k]))
    })
  }
})
