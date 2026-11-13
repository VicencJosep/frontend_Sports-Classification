import { DEFAULT_LAYERS, type LayerId, type LayerState } from '@/components/layers/layers'
import type { ReviewSubject, SavedClip } from '@/domain'
import { subjectId } from '@/domain'

export type SidebarTab = 'events' | 'actions' | 'highlights' | 'clips'

/**
 * What the clip editor is open on: a detected event or ball action (to correct it or cut a clip from it), the
 * playhead (`subject` null: a plain clip, or a play the pipeline missed) or a saved clip.
 * `intent` says what Enter does on a new item (save the correction / add the event, or save the clip) and
 * `resume` that the video was playing when the editor opened, so a saved correction carries on playing.
 */
export type EditorTarget =
  | { kind: 'new'; subject: ReviewSubject | null; atS: number; opened: number; intent: 'clip' | 'review'; resume: boolean }
  | { kind: 'edit'; clip: SavedClip; opened: number }

export interface ViewerState {
  layers: LayerState
  selectedTrackerId: number | null
  sidebarTab: SidebarTab
  editor: EditorTarget | null
}

export type ViewerAction =
  | { type: 'toggleLayer'; id: LayerId; on: boolean }
  | { type: 'selectTracker'; trackerId: number | null }
  | { type: 'setTab'; tab: SidebarTab }
  | { type: 'openEditor'; target: EditorTarget }
  | { type: 'closeEditor' }

export const initialViewerState: ViewerState = {
  layers: DEFAULT_LAYERS,
  selectedTrackerId: null,
  sidebarTab: 'events',
  editor: null,
}

export function viewerReducer(state: ViewerState, action: ViewerAction): ViewerState {
  switch (action.type) {
    case 'toggleLayer':
      return { ...state, layers: { ...state.layers, [action.id]: action.on } }
    case 'selectTracker':
      return { ...state, selectedTrackerId: action.trackerId }
    case 'setTab':
      return { ...state, sidebarTab: action.tab }
    case 'openEditor':
      return { ...state, editor: action.target }
    case 'closeEditor':
      return { ...state, editor: null }
  }
}

/** Key that remounts the editor when its target changes (a different event or clip, or reopened). */
export function editorKey(target: EditorTarget): string {
  if (target.kind === 'edit') return `edit:${target.clip.id}:${target.opened}`
  return `new:${target.subject ? subjectId(target.subject) : 'playhead'}:${target.opened}`
}
