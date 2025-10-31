'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Breadcrumb from '@/components/Breadcrumb';

interface Backup {
  name: string;
  size: number;
  sizeFormatted: string;
  createdAt: string;
  reason: string;
}

interface DBHealth {
  exists: boolean;
  size: number;
  walSize: number;
  shmSize: number;
  integrity: boolean;
}

export default function BackupPage() {
  const router = useRouter();
  const [backups, setBackups] = useState<Backup[]>([]);
  const [health, setHealth] = useState<DBHealth | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  const getSessionId = () => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('sessionId');
    }
    return null;
  };

  const getAuthHeaders = (): HeadersInit => {
    const sessionId = getSessionId();
    if (!sessionId) return {};
    return {
      'Authorization': `Bearer ${sessionId}`,
      'Content-Type': 'application/json'
    };
  };

  useEffect(() => {
    checkAuth();
    fetchBackups();
    fetchHealth();
  }, []);

  const checkAuth = async () => {
    try {
      const response = await fetch('/api/auth/session', {
        headers: getAuthHeaders(),
        credentials: 'include'
      });
      const data = await response.json();

      if (!data.user || !data.user.isAdmin) {
        alert('관리자 권한이 필요합니다.');
        router.push('/');
        return;
      }
    } catch (error) {
      console.error('Auth check error:', error);
      router.push('/auth');
    }
  };

  const fetchBackups = async () => {
    try {
      const response = await fetch('/api/backup', {
        headers: getAuthHeaders()
      });

      if (!response.ok) {
        throw new Error('Failed to fetch backups');
      }

      const data = await response.json();
      setBackups(data.backups || []);
    } catch (error) {
      console.error('Error fetching backups:', error);
      alert('백업 목록을 불러오지 못했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchHealth = async () => {
    try {
      const response = await fetch('/api/backup?action=health', {
        headers: getAuthHeaders()
      });

      if (!response.ok) {
        throw new Error('Failed to fetch health');
      }

      const data = await response.json();
      setHealth(data.health);
    } catch (error) {
      console.error('Error fetching health:', error);
    }
  };

  const createBackup = async () => {
    if (!confirm('수동 백업을 생성하시겠습니까?')) {
      return;
    }

    setIsCreating(true);
    try {
      const response = await fetch('/api/backup', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ action: 'create', reason: 'manual' })
      });

      if (!response.ok) {
        throw new Error('Failed to create backup');
      }

      alert('백업이 생성되었습니다.');
      fetchBackups();
    } catch (error) {
      console.error('Error creating backup:', error);
      alert('백업 생성에 실패했습니다.');
    } finally {
      setIsCreating(false);
    }
  };

  const restoreBackup = async (backupName: string) => {
    if (!confirm(`"${backupName}" 백업으로 복원하시겠습니까?\n\n⚠️ 현재 데이터는 자동으로 백업됩니다.`)) {
      return;
    }

    try {
      const response = await fetch('/api/backup', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ action: 'restore', backupName })
      });

      if (!response.ok) {
        throw new Error('Failed to restore backup');
      }

      alert('백업이 복원되었습니다. 페이지를 새로고침합니다.');
      window.location.reload();
    } catch (error) {
      console.error('Error restoring backup:', error);
      alert('백업 복원에 실패했습니다.');
    }
  };

  const deleteBackup = async (backupName: string) => {
    if (!confirm(`"${backupName}" 백업을 삭제하시겠습니까?`)) {
      return;
    }

    try {
      const response = await fetch('/api/backup', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ action: 'delete', backupName })
      });

      if (!response.ok) {
        throw new Error('Failed to delete backup');
      }

      alert('백업이 삭제되었습니다.');
      fetchBackups();
    } catch (error) {
      console.error('Error deleting backup:', error);
      alert('백업 삭제에 실패했습니다.');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('ko-KR');
  };

  const getReasonBadge = (reason: string) => {
    const configs: Record<string, { label: string; color: string }> = {
      manual: { label: '수동', color: 'bg-blue-500' },
      auto_before_script: { label: '자동', color: 'bg-green-500' },
      before_restore: { label: '복원 전', color: 'bg-yellow-500' },
      unknown: { label: '알 수 없음', color: 'bg-gray-500' }
    };

    const config = configs[reason] || configs.unknown;
    return (
      <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-semibold text-white ${config.color}`}>
        {config.label}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
      <div className="mx-auto max-w-6xl">
        <Breadcrumb />

        {/* 헤더 */}
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-4xl font-bold text-white">💾 데이터베이스 백업</h1>
          <div className="flex gap-3">
            <button
              onClick={createBackup}
              disabled={isCreating}
              className="rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 px-6 py-3 text-sm font-semibold text-white transition hover:from-purple-500 hover:to-pink-500 disabled:opacity-50"
            >
              {isCreating ? '생성 중...' : '➕ 수동 백업 생성'}
            </button>
            <Link
              href="/admin"
              className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-600"
            >
              뒤로가기
            </Link>
          </div>
        </div>

        {/* DB 상태 */}
        {health && (
          <div className="mb-6 rounded-2xl border border-white/10 bg-slate-800/50 p-6 backdrop-blur">
            <h2 className="text-xl font-bold text-white mb-4">📊 데이터베이스 상태</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-slate-900/50 rounded-lg p-4">
                <p className="text-slate-400 text-sm mb-1">DB 파일</p>
                <p className="text-white font-bold">{(health.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
              <div className="bg-slate-900/50 rounded-lg p-4">
                <p className="text-slate-400 text-sm mb-1">WAL 파일</p>
                <p className="text-white font-bold">{(health.walSize / 1024 / 1024).toFixed(2)} MB</p>
              </div>
              <div className="bg-slate-900/50 rounded-lg p-4">
                <p className="text-slate-400 text-sm mb-1">무결성</p>
                <p className={`font-bold ${health.integrity ? 'text-green-400' : 'text-red-400'}`}>
                  {health.integrity ? '✅ 정상' : '❌ 오류'}
                </p>
              </div>
              <div className="bg-slate-900/50 rounded-lg p-4">
                <p className="text-slate-400 text-sm mb-1">백업 개수</p>
                <p className="text-white font-bold">{backups.length}개</p>
              </div>
            </div>
          </div>
        )}

        {/* 백업 목록 */}
        <div className="space-y-4">
          {isLoading ? (
            <div className="text-center text-slate-400 py-12">로딩 중...</div>
          ) : backups.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-slate-800/50 p-16 text-center backdrop-blur">
              <div className="text-6xl mb-4">💾</div>
              <p className="text-xl text-slate-400 mb-2">백업이 없습니다</p>
              <p className="text-sm text-slate-500">상단의 "수동 백업 생성" 버튼을 눌러 백업을 생성하세요</p>
            </div>
          ) : (
            backups.map((backup) => (
              <div
                key={backup.name}
                className="rounded-2xl border border-white/10 bg-slate-800/50 p-6 backdrop-blur transition hover:border-purple-500/50"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      {getReasonBadge(backup.reason)}
                      <span className="text-xs text-slate-500">
                        {formatDate(backup.createdAt)}
                      </span>
                    </div>
                    <h3 className="text-lg text-white font-medium mb-2">{backup.name}</h3>
                    <p className="text-sm text-slate-400">크기: {backup.sizeFormatted}</p>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => restoreBackup(backup.name)}
                      className="rounded-lg bg-green-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-green-500"
                    >
                      🔄 복원
                    </button>
                    <button
                      onClick={() => deleteBackup(backup.name)}
                      className="rounded-lg bg-red-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-red-500"
                    >
                      🗑️ 삭제
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
