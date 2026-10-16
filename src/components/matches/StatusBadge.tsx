import { Badge, type BadgeTone } from '@/components/common'
import { STATUS_DISPLAY, type AnalysisStatus } from '@/domain'

const TONE: Record<AnalysisStatus, BadgeTone> = {
  pending: 'neutral',
  processing: 'info',
  completed: 'accent',
  error: 'danger',
}

export function StatusBadge({ status }: { status: AnalysisStatus }) {
  return (
    <Badge tone={TONE[status]} dot pulse={status === 'processing'}>
      {STATUS_DISPLAY[status]}
    </Badge>
  )
}
