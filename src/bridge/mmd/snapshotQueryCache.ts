export function createSnapshotQueryDocument(document: Document): Document {
  const queryResults = new Map<string, Element | null>()
  const queryAllResults = new Map<string, NodeListOf<Element>>()

  const querySelector = ((selectors: string): Element | null => {
    if (!queryResults.has(selectors)) {
      queryResults.set(selectors, document.querySelector(selectors))
    }
    return queryResults.get(selectors) ?? null
  }) as Document['querySelector']

  const querySelectorAll = ((selectors: string): NodeListOf<Element> => {
    let result = queryAllResults.get(selectors)
    if (!result) {
      result = document.querySelectorAll(selectors)
      queryAllResults.set(selectors, result)
    }
    return result
  }) as Document['querySelectorAll']

  return new Proxy(document, {
    get(target, property) {
      if (property === 'querySelector') return querySelector
      if (property === 'querySelectorAll') return querySelectorAll
      const value = Reflect.get(target, property, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}
