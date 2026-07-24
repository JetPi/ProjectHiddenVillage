import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageShell } from '../../components/layout/PageShell'
import { Panel } from '../../components/ui/Panel'
import { AppButton } from '../../components/ui/AppButton'
import {
  Form,
  FormActions,
  FormErrorText,
  FormField,
  FormHelperText,
  FormInput,
  FormLabel,
} from '../../components/forms'
import { useSessionStore } from '../../state/sessionStore'

export function LoginView() {
  const navigate = useNavigate()
  const setSession = useSessionStore((state) => state.setSession)
  const [displayName, setDisplayName] = useState('')
  const [gameCode, setGameCode] = useState('')
  const [showDisplayNameError, setShowDisplayNameError] = useState(false)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!displayName.trim()) {
      setShowDisplayNameError(true)
      return
    }

    setShowDisplayNameError(false)

    setSession({
      displayName,
      gameCode,
    })

    navigate('/game')
  }

  return (
    <PageShell>
      <div className="grid grid-cols-2 max-h-[85vh] justify-items-center">
         {/* <Panel className="w-1/2 max-w-xl"></Panel> */}
        <Panel className="w-full px-5 max-w-xl">
          <h1 className="text-4xl font-black leading-tight text-[var(--text-primary)] sm:text-3xl">
            Become Hokage!
          </h1>

          <Form className="mt-2" onSubmit={handleSubmit}>
            <FormField>
              <FormLabel htmlFor="displayName">Display Name</FormLabel>
              <FormInput
                id="displayName"
                value={displayName}
                onChange={(event) => {
                  setDisplayName(event.target.value)

                  if (showDisplayNameError && event.target.value.trim()) {
                    setShowDisplayNameError(false)
                  }
                }}
                placeholder="Enter name here"
                maxLength={24}
                required
              />
              {showDisplayNameError ? <FormErrorText>Please enter a display name.</FormErrorText> : null}
            </FormField>

            <FormField>
              <FormLabel htmlFor="gameCode">Game Code</FormLabel>
              <FormInput
                id="gameCode"
                value={gameCode}
                onChange={(event) => setGameCode(event.target.value)}
                className="uppercase"
                placeholder="ABCD-1234"
                maxLength={12}
              />
              <FormHelperText>Leave empty to create or join later from game flow.</FormHelperText>
            </FormField>

            <FormActions className="justify-start">
              <AppButton type="submit" >
                Enter Game
              </AppButton>
              <AppButton type="button" variant="ghost" >
                Create Lobby
              </AppButton>
            </FormActions>
          </Form>
        </Panel>
      </div>
    </PageShell>
  )
}
