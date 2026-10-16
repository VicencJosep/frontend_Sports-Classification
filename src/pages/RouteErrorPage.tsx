import { isRouteErrorResponse, useRouteError } from 'react-router'

import { Page } from '@/app/shell/Page'
import { ErrorState, LinkButton } from '@/components/common'

export function RouteErrorPage() {
  const error = useRouteError()
  const message = isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : error
  return (
    <Page title="Something went wrong">
      <ErrorState error={message} title="The page could not be rendered" />
      <div style={{ textAlign: 'center' }}>
        <LinkButton to="/" variant="primary">
          Back to Dashboard
        </LinkButton>
      </div>
    </Page>
  )
}
