'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { UploadCloud, X, Loader2, FileIcon } from 'lucide-react';
import { useConfirm } from '@/app/components/ui/ConfirmProvider';

interface HrmCustomFieldUploadProps {
  shopId: string;
  employeeId: string | null;
  fieldKey: string;
  value: string | undefined;
  onChange: (value: string) => void;
  maxSizeMb?: number;
}

export function HrmCustomFieldUpload({
  shopId,
  employeeId,
  fieldKey,
  value,
  onChange,
  maxSizeMb = 10,
}: HrmCustomFieldUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const confirm = useConfirm();

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > maxSizeMb * 1024 * 1024) {
      toast.error(`File không được vượt quá ${maxSizeMb}MB`);
      return;
    }

    if (!employeeId) {
      toast.error('Vui lòng lưu thông tin nhân viên trước khi upload tài liệu.');
      return;
    }

    setIsUploading(true);
    try {
      // 1. Get presigned URL
      const resUrl = await fetch(`/api/shops/${encodeURIComponent(shopId)}/hrm/upload-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId,
          filename: file.name,
          contentType: file.type || 'application/octet-stream',
        }),
      });
      const urlPayload = await resUrl.json();
      if (!resUrl.ok) throw new Error(urlPayload.error ?? 'Không thể lấy URL upload');

      const { uploadUrl, publicUrl, key } = urlPayload;

      // 2. Upload to R2
      const resUpload = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
        },
      });

      if (!resUpload.ok) {
        throw new Error('Upload file thất bại');
      }

      // 3. Save to form state (storing both publicUrl and key separated by pipe, or just URL if we don't care about delete)
      // We will store as JSON string or a pipe-separated string to keep the object key for deletion.
      const savedValue = JSON.stringify({ url: publicUrl, key, name: file.name });
      onChange(savedValue);
      toast.success('Đã tải tài liệu lên');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setIsUploading(false);
      event.target.value = ''; // Reset input
    }
  }

  async function handleDelete() {
    if (!value) return;
    
    let fileKey = '';
    try {
      const parsed = JSON.parse(value);
      fileKey = parsed.key;
    } catch {
      fileKey = '';
    }

    const accepted = await confirm({
      title: 'Xóa tài liệu này?',
      description: fileKey ? 'Tài liệu sẽ bị xóa vĩnh viễn khỏi máy chủ lưu trữ.' : 'Xóa đường dẫn tài liệu này?',
      confirmLabel: 'Xóa tài liệu',
      variant: 'danger',
    });

    if (!accepted) return;

    if (fileKey) {
      try {
        const res = await fetch(`/api/shops/${encodeURIComponent(shopId)}/hrm/upload-url/delete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: fileKey }),
        });
        if (!res.ok) {
          const payload = await res.json();
          throw new Error(payload.error ?? 'Không thể xóa file');
        }
      } catch (e: any) {
        toast.error(e.message);
        return;
      }
    }

    onChange('');
    toast.success('Đã xóa tài liệu');
  }

  let fileUrl = value;
  let fileName = 'Tài liệu đã tải lên';
  if (value && value.startsWith('{')) {
    try {
      const parsed = JSON.parse(value);
      fileUrl = parsed.url;
      fileName = parsed.name || fileName;
    } catch {}
  }

  return (
    <div className="mt-1">
      {value ? (
        <div className="flex items-center justify-between rounded-xl border border-slate-200 p-3 bg-slate-50">
          <div className="flex items-center gap-2 overflow-hidden">
            <FileIcon className="h-5 w-5 shrink-0 text-primary" />
            <a
              href={fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate text-sm font-medium text-primary hover:underline"
              title={fileName}
            >
              {fileName}
            </a>
          </div>
          <button
            type="button"
            onClick={handleDelete}
            className="ml-2 rounded-lg p-1.5 text-rose-500 hover:bg-rose-100"
            title="Xóa tài liệu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="relative flex items-center justify-center rounded-xl border-2 border-dashed border-slate-300 px-4 py-3 hover:border-primary">
          {isUploading ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Đang tải lên...
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <UploadCloud className="h-4 w-4" />
              <span>Bấm để tải tài liệu lên (Tối đa {maxSizeMb}MB)</span>
            </div>
          )}
          <input
            type="file"
            disabled={isUploading || !employeeId}
            onChange={handleFileChange}
            accept="image/*,.pdf,.doc,.docx,.zip,.rar"
            className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
            title={!employeeId ? 'Cần lưu nhân viên trước khi tải lên' : ''}
          />
        </div>
      )}
    </div>
  );
}
