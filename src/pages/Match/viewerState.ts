import { DEFAULT_LAYERS, type LayerId, type LayerState } from '@/components/layers/layers'

export type SidebarTab = 'events' | 'actions'

export interface ViewerState {
  layers: LayerState
  selectedTrackerId: number | null
  sidebarTab: SidebarTab
}

export type ViewerAction =
  | { type: 'toggleLayer'; id: LayerId; on: boolean }
  | { type: 'selectTracker'; trackerId: number | null }
  | { type: 'setTab'; tab: SidebarTab }

export const initialViewerState: ViewerState = {
  layers: DEFAULT_LAYERS,
  selectedTrackerId: null,
  sidebarTab: 'events',
}

export function viewerReducer(state: ViewerState, action: ViewerAction): ViewerState {
  switch (action.type) {
    case 'toggleLayer':
      return { ...state, layers: { ...state.layers, [action.id]: action.on } }
    case 'selectTracker':
      return { ...state, selectedTrackerId: action.trackerId }
    case 'setTab':
      return { ...state, sidebarTab: action.tab }
  }
}
