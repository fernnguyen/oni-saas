## Production Safety
- **Type Checking:** ALWAYS run a build check (`npm run build`, `npm run typecheck` or equivalent) before finalizing any changes, especially in production environments, to ensure no compilation errors or type errors are introduced.
- **Data Integrity:** NEVER execute arbitrary deletion scripts or destructive SQL commands without implementing a "dry run" first. 
- **Soft Deletes & Backups:** When cleaning up data (like duplicate funds, orders), ALWAYS implement soft-deletes or move data to a temporary/archived state first if possible. Do NOT permanently delete or truncate data unless absolutely verified and explicitly requested.
- **No Over-fetching/Over-writing:** When writing update logic, only update the necessary fields. Do NOT overwrite entire objects or states which could accidentally clear out parallel data changes made by other processes.
- **Transactions:** Always use transactions (e.g., `tx.add()`, DB transactions) when making multi-step financial or data updates (e.g. Sales + Debt Collection) to ensure atomicity. If one step fails, everything must roll back.
