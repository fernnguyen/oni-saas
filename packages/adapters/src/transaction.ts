/**
 * Utility for managing compensating transactions.
 * Registers undo actions that can be executed sequentially in reverse order if an operation fails.
 */
export class RollbackContext {
  private undoActions: Array<() => Promise<void>> = []

  /**
   * Add a compensating action to the transaction stack.
   * Actions are pushed to the stack and executed in reverse order on rollback.
   */
  add(action: () => Promise<void>) {
    this.undoActions.push(action)
  }

  /**
   * Execute all registered compensating actions.
   * If any action fails, the error is logged, and the rollback continues with the next actions.
   */
  async rollback(): Promise<void> {
    if (this.undoActions.length === 0) return

    console.warn(`[RollbackContext] Rolling back ${this.undoActions.length} actions...`)
    
    // Execute in reverse order
    for (let i = this.undoActions.length - 1; i >= 0; i--) {
      try {
        await this.undoActions[i]()
      } catch (err) {
        // Log but don't throw, try to execute as many rollbacks as possible
        console.error('[RollbackContext] Failed to execute an undo action during rollback:', err)
      }
    }
    
    console.warn(`[RollbackContext] Rollback completed.`)
  }
}
