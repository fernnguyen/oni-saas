'use client';

import { useHrmModuleAccess } from './HrmModuleAccess';
import { HrmLeaveRequestsPanel } from './HrmLeaveRequestsPanel';
import { useQuery } from '@tanstack/react-query';
import { HrmLeavesPageSkeleton } from './HrmContentSkeletons';

/**
 * Thin client wrapper so the server page.tsx can import without using context.
 * Reads shopId from HrmModuleAccessContext (injected by branch/layout.tsx).
 * Fetches selfProfileId and canManage from the leave API.
 */
export function HrmLeavesPageClient() {
  const { shopId } = useHrmModuleAccess();

  // Bootstrap: fetch selfProfileId and canManage from the leaves endpoint
  const bootstrapQuery = useQuery({
    queryKey: ['hrm-leave-requests', shopId],
    staleTime: 0,
    queryFn: async () => {
      const res = await fetch(`/api/shops/${encodeURIComponent(shopId)}/hrm/leaves`);
      if (!res.ok) throw new Error('Không tải được dữ liệu nghỉ phép.');
      return res.json() as Promise<{
        data: unknown[];
        canManage: boolean;
        selfProfileId: string | null;
      }>;
    },
  });

  if (bootstrapQuery.isLoading) {
    return <HrmLeavesPageSkeleton />;
  }

  return (
    <HrmLeaveRequestsPanel
      shopId={shopId}
      selfProfileId={bootstrapQuery.data?.selfProfileId ?? null}
      canManage={bootstrapQuery.data?.canManage ?? false}
    />
  );
}
