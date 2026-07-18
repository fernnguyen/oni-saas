import Image from 'next/image';

const ZALO_SUPPORT_GROUP_URL = 'https://zalo.me/g/owlxjd9bqfhocunnrjos';

export function FloatingZalo() {
  return (
    <div className="fixed bottom-6 right-6 z-50">
      <a
        href={ZALO_SUPPORT_GROUP_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="flex h-14 items-center gap-3 rounded-full bg-[#0068ff] px-4 text-sm font-bold text-white shadow-xl shadow-blue-900/20 transition-transform hover:scale-105"
        aria-label="Mở nhóm hỗ trợ Zalo"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15">
          <Image
            src="/partners/zalo.svg"
            alt=""
            width={24}
            height={24}
            className="h-6 w-6"
            aria-hidden="true"
          />
        </span>
        <span>Hỗ trợ qua Zalo</span>
      </a>
    </div>
  );
}
