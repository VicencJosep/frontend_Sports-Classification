import { DEFAULT_LAYERS, type LayerId, type LayerState } from '@/components/layers/layers'
import type { MatchEvent, SavedClip } from '@/domain'

export type SidebarTab = 'events' | 'actions' | 'highlights' | 'clips'

/** What the clip editor is open on: a new clip from an event (or the playhead) or a saved clip. */
export type EditorTarget = { kind: 'new'; event: MatchEvent | null; atS: number; opened: number } | { kind: 'edit'; clip: SavedClip; opened: number }

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
  return target.kind === 'edit' ? `edit:${target.clip.id}:${target.opened}` : `new:${target.event?.id ?? 'playhead'}:${target.opened}`
}
