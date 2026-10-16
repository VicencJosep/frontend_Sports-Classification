import { Badge } from '@/components/common'
import { ballActionColor, eventColor, labelDisplayName } from '@/domain'

export function EventBadge({ label }: { label: string }) {
  return <Badge color={eventColor(label)}>{labelDisplayName(label)}</Badge>
}

export function ActionBadge({ label }: { label: string }) {
  return <Badge color={ballActionColor(label)}>{labelDisplayName(label)}</Badge>
}
