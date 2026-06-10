'use client';

import Image from 'next/image';

export function AppDownloadButtons() {
  const handleDownloadClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    alert('Đang cập nhật');
  };

  return (
    <div className="flex items-center justify-center gap-4">
      <a 
        href="#" 
        onClick={handleDownloadClick}
        className="hover:opacity-80 transition-opacity drop-shadow-sm"
      >
        <Image 
          src="/partners/app-store.svg" 
          alt="Download on the App Store" 
          width={270} 
          height={80} 
          className="h-12 sm:h-14 md:h-16 w-auto" 
        />
      </a>
      <a 
        href="#" 
        onClick={handleDownloadClick}
        className="hover:opacity-80 transition-opacity drop-shadow-sm"
      >
        <Image 
          src="/partners/google-play.svg" 
          alt="Get it on Google Play" 
          width={270} 
          height={80} 
          className="h-12 sm:h-14 md:h-16 w-auto" 
        />
      </a>
    </div>
  );
}
