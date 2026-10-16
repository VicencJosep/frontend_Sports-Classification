/**
 * Scrolls `el` into view inside its nearest scrollable ancestor ONLY.
 * `Element.scrollIntoView` also scrolls every outer container (the page), which
 * is wrong for a list that follows the playhead.
 */
export function scrollIntoNearestScrollable(el: HTMLElement, behavior: ScrollBehavior = 'smooth'): void {
  const container = findScrollContainer(el)
  if (!container) return
  const elRect = el.getBoundingClientRect()
  const boxRect = container.getBoundingClientRect()
  const top = elRect.top - boxRect.top + container.scrollTop
  const bottom = top + elRect.height
  const viewTop = container.scrollTop
  const viewBottom = viewTop + container.clientHeight
  if (top >= viewTop && bottom <= viewBottom) return
  const target = top < viewTop ? top - 8 : bottom - container.clientHeight + 8
  container.scrollTo({ top: Math.max(0, target), behavior })
}

function findScrollContainer(el: HTMLElement): HTMLElement | null {
  let node = el.parentElement
  while (node) {
    const { overflowY } = getComputedStyle(node)
    // Stop at the first ancestor that scrolls its own content, even if it does not overflow right now:
    // climbing further would scroll the page.
    if (overflowY === 'auto' || overflowY === 'scroll') return node
    node = node.parentElement
  }
  return null
}
