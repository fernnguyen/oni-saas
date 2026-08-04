type SkeletonFrameProps = {
  label: string;
  className?: string;
  children: React.ReactNode;
};

function SkeletonFrame({ label, className = '', children }: SkeletonFrameProps) {
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className="animate-pulse">
        {children}
      </div>
    </div>
  );
}

function Bar({ className }: { className: string }) {
  return <div className={`rounded-lg bg-slate-200/80 ${className}`} />;
}

export function HrmGeneralSettingsSkeleton() {
  return (
    <SkeletonFrame label="Đang tải cấu hình chung" className="max-w-xl">
      <Bar className="h-4 w-64" />
      <Bar className="mt-3 h-3 w-full max-w-lg" />
      <Bar className="mt-2 h-3 w-4/5" />
      <div className="mt-4 flex items-center gap-3">
        <Bar className="h-10 w-32" />
        <Bar className="h-4 w-8" />
      </div>
      <Bar className="mt-8 h-10 w-32" />
    </SkeletonFrame>
  );
}

export function HrmAttendanceRulesSkeleton() {
  return (
    <SkeletonFrame label="Đang tải quy tắc chấm công" className="space-y-8">
      <section>
        <Bar className="h-4 w-72" />
        <Bar className="mt-3 h-3 w-full max-w-2xl" />
        <div className="mt-4 flex flex-wrap gap-4">
          {Array.from({ length: 7 }, (_, index) => (
            <div key={index} className="w-[120px] rounded-xl border border-slate-200 p-4">
              <Bar className="mx-auto h-4 w-14" />
              <Bar className="mx-auto mt-3 h-3 w-16" />
            </div>
          ))}
        </div>
      </section>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="rounded-xl border border-slate-200 p-4">
            <Bar className="h-3 w-2/3" />
            <Bar className="mt-3 h-10 w-full" />
          </div>
        ))}
      </section>
    </SkeletonFrame>
  );
}

export function HrmLeavesPageSkeleton() {
  return (
    <SkeletonFrame label="Đang tải dữ liệu nghỉ phép" className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Bar className="h-6 w-44" />
          <Bar className="h-3 w-72 max-w-full" />
        </div>
        <Bar className="h-10 w-36" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="rounded-2xl border border-slate-200 bg-white p-4">
            <Bar className="h-3 w-24" />
            <Bar className="mt-3 h-7 w-16" />
          </div>
        ))}
      </div>
      <div className="flex gap-3">
        <Bar className="h-10 flex-1" />
        <Bar className="h-10 w-40" />
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="grid grid-cols-4 gap-4 bg-slate-50 px-4 py-3">
          {Array.from({ length: 4 }, (_, index) => <Bar key={index} className="h-3 w-20" />)}
        </div>
        {Array.from({ length: 5 }, (_, row) => (
          <div key={row} className="grid grid-cols-4 gap-4 border-t border-slate-100 px-4 py-4">
            {Array.from({ length: 4 }, (_, cell) => (
              <Bar key={cell} className={cell === 0 ? 'h-4 w-28' : 'h-4 w-20'} />
            ))}
          </div>
        ))}
      </div>
    </SkeletonFrame>
  );
}

export function HrmHolidayCalendarSkeleton() {
  return (
    <SkeletonFrame label="Đang tải lịch nghỉ lễ">
      <div className="grid w-full grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3 xl:gap-8">
        {Array.from({ length: 6 }, (_, month) => (
          <div key={month} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <Bar className="mx-auto mb-5 h-4 w-20" />
            <div className="grid grid-cols-7 gap-1.5">
              {Array.from({ length: 35 }, (_, day) => (
                <div key={day} className="aspect-square rounded-md bg-slate-100" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </SkeletonFrame>
  );
}

export function HrmMonthlyAttendanceSkeleton() {
  return (
    <SkeletonFrame label="Đang tải bảng công tháng" className="min-w-[920px] bg-white">
      <div className="flex gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
        <Bar className="h-4 w-44 shrink-0" />
        {Array.from({ length: 12 }, (_, index) => <Bar key={index} className="h-4 w-10 shrink-0" />)}
      </div>
      {Array.from({ length: 6 }, (_, row) => (
        <div key={row} className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-0">
          <div className="w-44 shrink-0 space-y-2">
            <Bar className="h-4 w-32" />
            <Bar className="h-3 w-20" />
          </div>
          {Array.from({ length: 12 }, (_, cell) => (
            <div key={cell} className="h-9 w-10 shrink-0 rounded-lg bg-slate-100" />
          ))}
        </div>
      ))}
    </SkeletonFrame>
  );
}

export function HrmSalaryAdvancesSkeleton() {
  return (
    <SkeletonFrame label="Đang tải danh sách ứng lương" className="p-4 sm:p-5">
      <div className="hidden grid-cols-5 gap-4 border-b border-slate-200 pb-3 md:grid">
        {Array.from({ length: 5 }, (_, index) => <Bar key={index} className="h-3 w-20" />)}
      </div>
      <div className="space-y-3 pt-1 md:pt-0">
        {Array.from({ length: 5 }, (_, row) => (
          <div key={row} className="grid gap-3 rounded-xl border border-slate-100 p-4 md:grid-cols-5 md:items-center md:rounded-none md:border-x-0 md:border-t-0">
            <div className="space-y-2">
              <Bar className="h-4 w-28" />
              <Bar className="h-3 w-16" />
            </div>
            <Bar className="h-4 w-24" />
            <Bar className="h-4 w-20" />
            <Bar className="h-6 w-20 rounded-full" />
            <Bar className="h-8 w-24 md:ml-auto" />
          </div>
        ))}
      </div>
    </SkeletonFrame>
  );
}

export function HrmSalaryGroupsSkeleton() {
  return (
    <SkeletonFrame label="Đang tải các nhóm lương">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-2">
                <Bar className="h-5 w-36" />
                <Bar className="h-3 w-24" />
              </div>
              <Bar className="h-6 w-20 rounded-full" />
            </div>
            <Bar className="mt-5 h-7 w-40" />
            <div className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4">
              <div className="space-y-2">
                <Bar className="h-3 w-20" />
                <Bar className="h-4 w-14" />
              </div>
              <div className="space-y-2">
                <Bar className="h-3 w-20" />
                <Bar className="h-4 w-16" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </SkeletonFrame>
  );
}

export function HrmSelectSkeleton({ label = 'Đang tải lựa chọn' }: { label?: string }) {
  return (
    <SkeletonFrame label={label} className="mt-1">
      <div className="h-10 w-full rounded-xl border border-slate-200 bg-slate-100" />
    </SkeletonFrame>
  );
}
