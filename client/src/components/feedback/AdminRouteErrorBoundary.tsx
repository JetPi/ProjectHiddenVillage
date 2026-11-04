import { isRouteErrorResponse, useRouteError } from 'react-router-dom'
import { RouteErrorBoundary } from '@/components/feedback/RouteErrorBoundary'
import { NotFoundView } from '@/views/NotFoundView'

/**
 * The admin subtree's error surface.
 *
 * The route guard answers "not an admin" with a plain 404, which lands here: rendering the ordinary not-found page
 * is what keeps the admin URLs indistinguishable from URLs that never existed. Everything else - a failed
 * verification call, a render error - keeps the standard boundary, because those are genuine failures the operator
 * needs to see rather than permission decisions.
 */
export function AdminRouteErrorBoundary() {
  const error = useRouteError()

  if (isRouteErrorResponse(error) && error.status === 404) {
    return <NotFoundView />
  }

  return <RouteErrorBoundary />
}
