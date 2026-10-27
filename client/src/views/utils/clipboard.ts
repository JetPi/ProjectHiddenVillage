/**
 * Copies text on behalf of a click. The async Clipboard API is the only path that works without touching the
 * document, but it needs a secure context and a permission, so a hidden textarea + `execCommand` fallback keeps
 * the copy buttons usable on plain-http deployments and in browsers that refuse the modern API.
 */
export async function copyTextToClipboard(value: string): Promise<boolean> {
  const text = value ?? ''

  if (typeof navigator !== 'undefined' && typeof navigator.clipboard?.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // The API exists but refused (insecure context, denied permission, unfocused document): fall through.
    }
  }

  return copyWithLegacyCommand(text)
}

function copyWithLegacyCommand(text: string): boolean {
  if (typeof document === 'undefined' || !document.body) {
    return false
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  // Off-screen rather than hidden: a display:none field cannot be selected, and selecting is what copies.
  textarea.style.position = 'fixed'
  textarea.style.top = '0'
  textarea.style.left = '0'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)

  try {
    textarea.select()
    return typeof document.execCommand === 'function' && document.execCommand('copy')
  } catch {
    return false
  } finally {
    textarea.remove()
  }
}
