import { Page } from '@/app/shell/Page'
import { EmptyState, LinkButton } from '@/components/common'

export function NotFoundPage() {
  return (
    <Page title="Page not found">
      <EmptyState title="There is nothing at this address.">
        <LinkButton to="/" variant="primary" style={{ marginTop: 12 }}>
          Back to Dashboard
        </LinkButton>
      </EmptyState>
    </Page>
  )
}
