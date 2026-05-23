'use client';

import React, { useState } from 'react';
import { useNotificationCenter, AppNotification } from './NotificationContext';

interface Props {
  shopId: string;
}

export function NotificationDropdown({ shopId }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'qr' | 'other'>('all');
  
  const {
    notifications,
    unreadCount,
    isMuted,
    toggleMute,
    markAsRead,
    markAllAsRead,
    openQRDrawer
  } = useNotificationCenter();

  // Filter notifications by tab
  const filteredNotifications = notifications.filter((n) => {
    if (activeTab === 'qr') {
      return n.type === 'qr_order' || n.type === 'qr_session';
    }
    if (activeTab === 'other') {
      return n.type !== 'qr_order' && n.type !== 'qr_session';
    }
    return true;
  });

  const handleNotificationClick = (n: AppNotification) => {
    markAsRead(n.id);
    setIsOpen(false);
    
    // Redirect to specialized global drawer depending on type
    if (n.type === 'qr_order') {
      openQRDrawer('orders', n.metadata?.orderId);
    } else if (n.type === 'qr_session') {
      openQRDrawer('sessions', n.metadata?.sessionId);
    }
  };

  return (
    <div className="relative inline-flex items-center">
      {/* Bell Icon Trigger */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-all focus:outline-none cursor-pointer"
        title="Thông báo vận hành"
      >
        <svg
          className={`h-5 w-5 ${unreadCount > 0 ? 'animate-[bell-wiggle_1.5s_infinite] text-orange-500' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>

        {/* Counter Badge */}
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 inline-flex items-center justify-center min-w-[16px] h-4 px-1 text-[9px] font-black leading-none text-white bg-red-600 rounded-full transform translate-x-0.5 -translate-y-0.5 shadow-[0_0_8px_rgba(220,38,38,0.4)]">
            {unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Popover */}
      {isOpen && (
        <>
          {/* Backdrop catcher */}
          <div className="fixed inset-0 z-40 cursor-default bg-transparent" onClick={() => setIsOpen(false)} />
          
          <div className="absolute right-0 mt-2 top-full w-80 sm:w-96 rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl z-50 flex flex-col max-h-[500px] overflow-hidden animate-[popover-in_0.18s_ease-out]">
            {/* Header */}
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/20">
              <div>
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">Thông báo</h4>
                {unreadCount > 0 && (
                  <p className="text-[10px] text-orange-500 font-semibold mt-0.5">Bạn có {unreadCount} tin chưa đọc</p>
                )}
              </div>
              
              <div className="flex items-center gap-2">
                {/* Proactive QR Drawer Link */}
                <button
                  onClick={() => {
                    setIsOpen(false);
                    openQRDrawer('sessions');
                  }}
                  className="p-1.5 text-orange-500 hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                  title="Mở bảng duyệt QR"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" className="w-4.5 h-4.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 3.75 9.375v-4.5ZM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 0 1-1.125-1.125v-4.5ZM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 13.5 9.375v-4.5Z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 13.5h1.125v1.125H13.5V13.5ZM14.625 14.625h1.125V15.75h-1.125v-1.125ZM13.5 15.75h1.125V16.875H13.5V15.75ZM15.75 13.5h1.125v1.125H15.75V13.5ZM16.875 14.625h1.125V15.75h-1.125v-1.125ZM15.75 15.75h1.125V16.875H15.75V15.75ZM13.5 18h1.125v1.125H13.5V18ZM14.625 19.125h1.125V20.25h-1.125v-1.125ZM15.75 18h1.125v1.125H15.75V18ZM18 13.5h1.125v1.125H18V13.5ZM19.125 14.625h1.125V15.75h-1.125v-1.125ZM18 15.75h1.125V16.875H18V15.75ZM18 18h1.125v1.125H18V18ZM19.125 19.125h1.125V20.25h-1.125v-1.125ZM20.25 18h1.125v1.125H20.25V18ZM20.25 13.5h1.125v1.125H20.25V13.5ZM20.25 15.75h1.125V16.875H20.25V15.75Z" />
                  </svg>
                </button>

                {/* Mute Toggle */}
                <button
                  onClick={toggleMute}
                  className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                  title={isMuted ? 'Bật âm báo' : 'Tắt âm báo'}
                >
                  {isMuted ? (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-red-500">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75 19.5 12m0 0 2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6 4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-slate-400 dark:text-slate-500">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
                    </svg>
                  )}
                </button>

                {/* Mark all as read */}
                {unreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    className="text-[10px] font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 px-2 py-1.5 rounded-lg transition-all cursor-pointer"
                  >
                    Đọc tất cả
                  </button>
                )}
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex border-b border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/30 p-1 gap-1">
              <button
                onClick={() => setActiveTab('all')}
                className={`flex-1 py-1.5 text-[11px] font-bold rounded-md ${
                  activeTab === 'all'
                    ? 'bg-white dark:bg-slate-800 text-orange-600 dark:text-orange-400 shadow-sm border border-slate-200/50 dark:border-slate-700/50'
                    : 'text-slate-500 hover:text-slate-850 dark:hover:text-slate-200 hover:bg-slate-100/60 dark:hover:bg-slate-800/40'
                }`}
              >
                Tất cả
              </button>
              <button
                onClick={() => setActiveTab('qr')}
                className={`flex-1 py-1.5 text-[11px] font-bold rounded-md flex items-center justify-center gap-1 ${
                  activeTab === 'qr'
                    ? 'bg-white dark:bg-slate-800 text-orange-600 dark:text-orange-400 shadow-sm border border-slate-200/50 dark:border-slate-700/50'
                    : 'text-slate-500 hover:text-slate-850 dark:hover:text-slate-200 hover:bg-slate-100/60 dark:hover:bg-slate-800/40'
                }`}
              >
                Yêu cầu QR
                {notifications.filter((n) => n.type === 'qr_order' || n.type === 'qr_session').length > 0 && (
                  <span className="px-1 py-0.2 text-[8px] font-bold rounded bg-orange-100 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400">
                    {notifications.filter((n) => n.type === 'qr_order' || n.type === 'qr_session').length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('other')}
                className={`flex-1 py-1.5 text-[11px] font-bold rounded-md ${
                  activeTab === 'other'
                    ? 'bg-white dark:bg-slate-800 text-orange-600 dark:text-orange-400 shadow-sm border border-slate-200/50 dark:border-slate-700/50'
                    : 'text-slate-500 hover:text-slate-850 dark:hover:text-slate-200 hover:bg-slate-100/60 dark:hover:bg-slate-800/40'
                }`}
              >
                Cảnh báo khác
              </button>
            </div>

            {/* List Body */}
            <div className="flex-1 overflow-y-auto min-h-[150px] max-h-[350px] divide-y divide-slate-50 dark:divide-slate-800/40">
              {filteredNotifications.length === 0 ? (
                <div className="p-8 text-center text-slate-400 dark:text-slate-500 flex flex-col items-center justify-center">
                  <div className="h-10 w-10 rounded-full bg-slate-50 dark:bg-slate-800 text-slate-400 flex items-center justify-center mb-3">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                  </div>
                  <h5 className="text-xs font-bold text-slate-700 dark:text-slate-300">Không có thông báo nào</h5>
                  <p className="text-[10px] text-slate-400 mt-1 max-w-[200px]">Mọi cảnh báo vận hành sẽ được cập nhật tức thì tại đây.</p>
                </div>
              ) : (
                filteredNotifications.map((n) => {
                  const isUnread = n.status === 'unread';
                  
                  return (
                    <div
                      key={n.id}
                      onClick={() => handleNotificationClick(n)}
                      className={`p-3.5 flex items-start gap-3 transition-colors cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 relative ${
                        isUnread ? 'bg-orange-50/10 dark:bg-orange-950/5' : ''
                      }`}
                    >
                      {/* Left: Indicator & Icon */}
                      <div className="flex-shrink-0 mt-0.5 flex items-center gap-1.5">
                        {isUnread && (
                          <span className="w-1.5 h-1.5 bg-orange-500 rounded-full shrink-0" />
                        )}
                        <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs shrink-0 font-bold ${
                          n.type === 'qr_session'
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400'
                            : n.type === 'qr_order'
                            ? 'bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400'
                            : 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400'
                        }`}>
                          {n.type === 'qr_session' ? '🚪' : n.type === 'qr_order' ? '🛎️' : '🔔'}
                        </span>
                      </div>

                      {/* Middle: Text Details */}
                      <div className="flex-1 min-w-0 pr-1.5">
                        <div className="flex justify-between items-baseline gap-2">
                          <h5 className={`text-xs truncate leading-snug ${isUnread ? 'font-bold text-slate-800 dark:text-slate-200' : 'font-medium text-slate-500 dark:text-slate-400'}`}>
                            {n.title}
                          </h5>
                          <span className="text-[9px] text-slate-400 dark:text-slate-500 shrink-0 font-medium">
                            {new Date(n.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className={`text-[10px] mt-1 leading-normal ${isUnread ? 'text-slate-600 dark:text-slate-300 font-medium' : 'text-slate-400 dark:text-slate-500'}`}>
                          {n.description}
                        </p>
                        

                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}

      {/* Popover Bell Animations */}
      <style jsx global>{`
        @keyframes bell-wiggle {
          0%, 100% { transform: rotate(0deg); }
          15% { transform: rotate(12deg); }
          30% { transform: rotate(-10deg); }
          45% { transform: rotate(8deg); }
          60% { transform: rotate(-6deg); }
          75% { transform: rotate(4deg); }
          90% { transform: rotate(-2deg); }
        }
        @keyframes popover-in {
          from { opacity: 0; transform: translateY(8px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
