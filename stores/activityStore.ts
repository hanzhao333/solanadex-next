'use client'

import { create } from 'zustand'

export type ActivityKind = 'swap' | 'pool-create' | 'pool-add' | 'pool-remove'

export interface ActivityItem {
  id: string
  kind: ActivityKind
  signature: string
  status: 'pending' | 'confirmed' | 'failed'
  detail: string
  createdAt: number
}

interface ActivityState {
  items: ActivityItem[]
  push: (item: Omit<ActivityItem, 'id' | 'createdAt' | 'status'> & Partial<Pick<ActivityItem, 'status'>>) => string
  update: (id: string, patch: Partial<ActivityItem>) => void
}

export const useActivityStore = create<ActivityState>((set, get) => ({
  items: [],
  push: (item) => {
    const id = crypto.randomUUID()
    set({
      items: [
        {
          id,
          status: item.status ?? 'pending',
          createdAt: Date.now(),
          ...item,
        } as ActivityItem,
        ...get().items,
      ].slice(0, 200),
    })
    return id
  },
  update: (id, patch) =>
    set({
      items: get().items.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    }),
}))
