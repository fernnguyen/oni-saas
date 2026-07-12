import React, { useEffect } from 'react';
import { useNotificationStore } from '@/stores/notification-store';
import { useNavigate } from 'react-router-dom';

function timeAgo(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.round(diffMs / 60000);
  
  if (diffMins < 1) return 'Vừa xong';
  if (diffMins < 60) return `${diffMins} phút trước`;
  const diffHours = Math.round(diffMins / 60);
  if (diffHours < 24) return `${diffHours} giờ trước`;
  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 30) return `${diffDays} ngày trước`;
  return d.toLocaleDateString('vi-VN');
}

export default function NotificationsPage() {
  const { notifications, loading, markAsRead, markAllAsRead, fetchNotifications } = useNotificationStore();
  const navigate = useNavigate();

  useEffect(() => {
    // Refresh notifications when opening the page
    fetchNotifications();
  }, [fetchNotifications]);

  const handleNotificationClick = (notif: any) => {
    if (!notif.notification_reads?.length) {
      markAsRead(notif.id);
    }
    
    // Simple navigation logic based on notification type
    if (notif.type === 'qr_order' || notif.type === 'qr_session') {
      navigate('/qr-orders');
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Content */}
      <div className="p-4 flex-1">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-bold text-lg text-foreground">Gần đây</h2>
          <button 
            onClick={markAllAsRead}
            disabled={loading || notifications.length === 0}
            className="text-primary font-medium text-sm disabled:opacity-50"
          >
            Đánh dấu đã đọc
          </button>
        </div>

        {loading && notifications.length === 0 ? (
          <div className="flex justify-center p-8">
            <span className="text-muted-foreground text-sm">Đang tải...</span>
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <svg className="text-muted-foreground opacity-30 mb-4" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
            </svg>
            <span className="text-muted-foreground text-sm">Bạn không có thông báo nào.</span>
          </div>
        ) : (
          <div className="space-y-3 pb-8">
            {notifications.map((notif) => {
              const isUnread = !notif.notification_reads?.length;
              return (
                <div 
                  key={notif.id}
                  onClick={() => handleNotificationClick(notif)}
                  className={`p-3 rounded-xl border flex gap-3 transition-colors cursor-pointer ${
                    isUnread ? 'bg-primary/5 border-primary/20' : 'bg-card border-border'
                  }`}
                >
                  <div className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${isUnread ? 'bg-primary' : 'bg-transparent'}`} />
                  <div className="flex-1">
                    <h3 className={`font-semibold text-sm ${isUnread ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {notif.title}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                      {notif.content}
                    </p>
                    <p className="text-xs text-muted-foreground/60 mt-1.5">
                      {timeAgo(notif.created_at)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
