'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { ConfirmDialog } from './ConfirmDialog'

interface ConfirmOptions {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'default' | 'success'
  onConfirm?: () => Promise<any>
  children?: React.ReactNode
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{
    open: boolean
    options: ConfirmOptions
    resolve: (v: boolean) => void
  } | null>(null)
  const [loading, setLoading] = useState(false)

  const confirm: ConfirmFn = useCallback((options) => {
    return new Promise((resolve) => {
      setState({ open: true, options, resolve })
    })
  }, [])

  function handleClose() {
    state?.resolve(false)
    setState(null)
    setLoading(false)
  }

  async function handleConfirm() {
    if (state?.options.onConfirm) {
      setLoading(true)
      try {
        await state.options.onConfirm()
        state.resolve(true)
        setState(null)
      } catch (e) {
        console.error('Error inside confirm callback:', e)
      } finally {
        setLoading(false)
      }
    } else {
      state?.resolve(true)
      setState(null)
    }
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <ConfirmDialog
          open={state.open}
          onClose={handleClose}
          onConfirm={handleConfirm}
          title={state.options.title}
          description={state.options.description}
          confirmLabel={state.options.confirmLabel}
          cancelLabel={state.options.cancelLabel}
          variant={state.options.variant}
          loading={loading}
          disableOutsideClick={loading}
          children={state.options.children}
        />
      )}
    </ConfirmContext.Provider>
  )
}

export function useConfirm(): ConfirmFn {
  const fn = useContext(ConfirmContext)
  if (!fn) throw new Error('useConfirm must be used inside ConfirmProvider')
  return fn
}
