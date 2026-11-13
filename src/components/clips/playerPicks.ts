/** A player clicked on the video while the editor is open. */
export interface PlayerPick {
  trackerId: number
  jersey: number | null
}

export interface PlayerPickSource {
  subscribe: (listener: (pick: PlayerPick) => void) => () => void
}

export interface PlayerPickChannel extends PlayerPickSource {
  emit: (pick: PlayerPick) => void
}

/** Carries the clicks on the video's players to the open editor without re-rendering anything in between. */
export function createPlayerPickChannel(): PlayerPickChannel {
  const listeners = new Set<(pick: PlayerPick) => void>()
  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    emit(pick) {
      for (const listener of listeners) listener(pick)
    },
  }
}
