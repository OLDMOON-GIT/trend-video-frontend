'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Breadcrumb() {
  const pathname = usePathname();

  // 경로에 따른 breadcrumb 매핑
  const getBreadcrumbs = () => {
    const crumbs: { label: string; href: string }[] = [];

    if (pathname === '/') {
      return crumbs;
    }

    if (pathname.startsWith('/my-videos')) {
      crumbs.push({ label: '내 영상', href: '/my-videos' });
    } else if (pathname.startsWith('/my-scripts')) {
      crumbs.push({ label: '내 대본', href: '/my-scripts' });
    } else if (pathname.startsWith('/my-content')) {
      crumbs.push({ label: '내 콘텐츠', href: '/my-content' });
    } else if (pathname.startsWith('/coupang')) {
      crumbs.push({ label: '쿠팡 파트너스', href: '/coupang' });
    } else if (pathname.startsWith('/credits/charge')) {
      crumbs.push({ label: '크레딧', href: '/credits' });
      crumbs.push({ label: '충전', href: '/credits/charge' });
    } else if (pathname.startsWith('/credits')) {
      crumbs.push({ label: '크레딧', href: '/credits' });
    } else if (pathname.startsWith('/admin/users')) {
      crumbs.push({ label: '관리자', href: '/admin' });
      crumbs.push({ label: '사용자 관리', href: '/admin/users' });
    } else if (pathname.startsWith('/admin/charge-requests')) {
      crumbs.push({ label: '관리자', href: '/admin' });
      crumbs.push({ label: '충전 요청', href: '/admin/charge-requests' });
    } else if (pathname.startsWith('/admin/settings')) {
      crumbs.push({ label: '관리자', href: '/admin' });
      crumbs.push({ label: '설정', href: '/admin/settings' });
    } else if (pathname.startsWith('/admin/user-activity')) {
      crumbs.push({ label: '관리자', href: '/admin' });
      crumbs.push({ label: '사용자 활동', href: '/admin/user-activity' });
    } else if (pathname.startsWith('/admin/prompts')) {
      crumbs.push({ label: '관리자', href: '/admin' });
      crumbs.push({ label: '프롬프트 관리', href: '/admin/prompts' });
    } else if (pathname.startsWith('/admin')) {
      crumbs.push({ label: '관리자', href: '/admin' });
    } else if (pathname.startsWith('/auth')) {
      crumbs.push({ label: '로그인', href: '/auth' });
    }

    return crumbs;
  };

  const breadcrumbs = getBreadcrumbs();

  // breadcrumb이 없으면 아무것도 표시하지 않음
  if (breadcrumbs.length === 0) {
    return null;
  }

  return (
    <nav className="flex items-center gap-2 text-sm font-bold">
      {breadcrumbs.map((crumb, index) => (
        <div key={crumb.href} className="flex items-center gap-2">
          {index > 0 && (
            <span className="text-slate-500">/</span>
          )}
          {index === breadcrumbs.length - 1 ? (
            <span className="text-slate-400">{crumb.label}</span>
          ) : (
            <Link
              href={crumb.href}
              className="text-purple-400 hover:text-purple-300 transition"
            >
              {crumb.label}
            </Link>
          )}
        </div>
      ))}
    </nav>
  );
}
