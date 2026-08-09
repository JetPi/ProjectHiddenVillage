import { useCallback } from 'react'
import { useSubmit } from 'react-router-dom'

function useGameIntentSubmit(): (intent: string) => void {
  const submit = useSubmit()

  return useCallback(
    (intent: string) => {
      submit({ intent }, { method: 'post' })
    },
    [submit],
  )
}

export {
  useGameIntentSubmit,
}