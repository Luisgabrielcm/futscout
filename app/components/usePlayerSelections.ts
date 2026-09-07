"use client"

import { useMemo, useSyncExternalStore } from "react"
import { COMPARISON_KEY, FAVORITES_KEY, FAVORITES_LIMIT, createPlayerSelectionStore, parseStoredPlayers } from "../../lib/playerSelections"

const browserStorage = () => typeof window === "undefined" ? undefined : window.localStorage
const stores = {
  favorites: createPlayerSelectionStore(browserStorage, FAVORITES_KEY, FAVORITES_LIMIT),
  comparison: createPlayerSelectionStore(browserStorage, COMPARISON_KEY, 2),
}

function subscribe(kind: keyof typeof stores, listener: () => void) {
  const unsubscribe = stores[kind].subscribe(listener)
  const key = kind === "favorites" ? FAVORITES_KEY : COMPARISON_KEY
  const onStorage = (event: StorageEvent) => {
    if (event.key === key || event.key === null) stores[kind].notify()
  }
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage)
  return () => {
    unsubscribe()
    if (typeof window !== "undefined") window.removeEventListener("storage", onStorage)
  }
}
const subscriptions = {
  favorites: (listener: () => void) => subscribe("favorites", listener),
  comparison: (listener: () => void) => subscribe("comparison", listener),
}
const serverSnapshot = () => "[]"
const clientReady = () => true
const serverReady = () => false

export function usePlayerSelections(kind: keyof typeof stores) {
  const snapshot = useSyncExternalStore(subscriptions[kind], stores[kind].getSnapshot, serverSnapshot)
  const ready = useSyncExternalStore(subscriptions[kind], clientReady, serverReady)
  const slugs = useMemo(() => parseStoredPlayers(snapshot, kind === "favorites" ? FAVORITES_LIMIT : 2), [snapshot, kind])
  return { slugs, ready, toggle: stores[kind].toggle }
}
