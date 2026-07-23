import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import type { Category, Product } from '@/services/shop-api';
import { apiFetch } from '@/services/api';
import { BarcodeScannerModal } from '@/components/barcode-scanner-modal';
import { supabase } from '@/lib/supabase';

function maskMoney(value: string) {
  const digits = value.replace(/\D/g, '');
  return digits ? Number(digits).toLocaleString('vi-VN') : '';
}

interface Props {
  open: boolean;
  initialName?: string;
  initialBarcode?: string;
  categories: Category[];
  shopId: string;
  onClose: () => void;
  onSave: (payload: { name: string; barcode: string; sell_price: number; cost_price: number; min_price: number; unit: string; category_id: string; image_url: string }) => Promise<Product>;
  onCreated: (product: Product) => void;
}

export default function QuickCreateProductModal({ open, initialName = '', initialBarcode = '', categories, shopId, onClose, onSave, onCreated }: Props) {
  const [name, setName] = useState(initialName);
  const [barcode, setBarcode] = useState(initialBarcode);
  const [price, setPrice] = useState('');
  const [unit, setUnit] = useState('Cái');
  const [categoryId, setCategoryId] = useState('');
  const [saving, setSaving] = useState(false);
  const [costPrice, setCostPrice] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [showMore, setShowMore] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [localImageUri, setLocalImageUri] = useState<string | null>(null);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isPioneerPlan, setIsPioneerPlan] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const loadImageEntitlement = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data: member } = await supabase.from('user_tenants').select('tenant_id').eq('user_id', user.id).limit(1).maybeSingle();
        if (!member?.tenant_id) return;
        const { data: subscription } = await supabase.from('subscriptions').select('plans (code)').eq('tenant_id', member.tenant_id).maybeSingle();
        const planCode = (subscription?.plans as { code?: string } | null)?.code;
        if (!cancelled) setIsPioneerPlan(!planCode || planCode === 'plan_mini');
      } catch (error) {
        console.warn('Cannot load quick-create image entitlement:', error);
      }
    };
    void loadImageEntitlement();
    return () => { cancelled = true; };
  }, [shopId]);

  useEffect(() => {
    if (!open) return;
    setName(initialName);
    setBarcode(initialBarcode);
    setPrice('');
    setUnit('Cái');
    setCategoryId('');
    setCostPrice('');
    setMinPrice('');
    setShowMore(false);
    setImageUrl('');
    setLocalImageUri(null);
    setShowUrlInput(false);
  }, [open, initialName, initialBarcode]);

  if (!open) return null;
  const close = () => { if (!saving) onClose(); };
  const save = async () => {
    const sellPrice = Number(price.replace(/\D/g, '') || 0);
    if (!name.trim()) {
      toast.error('Vui lòng nhập tên sản phẩm');
      return;
    }
    if (isPioneerPlan && localImageUri) {
      toast.error('Gói Tiên phong chỉ hỗ trợ ảnh từ URL');
      return;
    }
    setSaving(true);
    try {
      let product = await onSave({ name: name.trim(), barcode: barcode.trim(), sell_price: sellPrice, cost_price: Number(costPrice.replace(/\D/g, '') || 0), min_price: Number(minPrice.replace(/\D/g, '') || 0), unit: unit.trim() || 'Cái', category_id: categoryId, image_url: localImageUri ? '' : imageUrl.trim() });
      if (localImageUri) {
        try {
          toast.loading('Đã tạo sản phẩm. Đang tải ảnh lên...', { id: 'quick-image-upload' });
          const productId = product.product_id || product.id;
          const { uploadUrl, publicUrl } = await apiFetch<{ uploadUrl: string; publicUrl: string }>(`/api/shops/${shopId}/products/${productId}/upload-url`);
          const imageResponse = await fetch(localImageUri);
          const uploadResponse = await fetch(uploadUrl, { method: 'PUT', body: await imageResponse.blob(), headers: { 'Content-Type': 'image/jpeg' } });
          if (!uploadResponse.ok) throw new Error('Upload ảnh thất bại');
          await apiFetch(`/api/shops/${shopId}/products/${productId}`, { method: 'PUT', body: JSON.stringify({ image_url: publicUrl }) });
          product = { ...product, image_url: publicUrl };
          toast.success('Đã tải ảnh sản phẩm', { id: 'quick-image-upload' });
        } catch (uploadError: any) {
          toast.error(`Đã tạo sản phẩm nhưng tải ảnh lỗi: ${uploadError?.message || 'Không xác định'}`, { id: 'quick-image-upload' });
        }
      }
      onCreated(product);
      onClose();
      toast.success('Đã tạo sản phẩm và thêm vào giỏ');
    } catch (error: any) {
      toast.error(error?.message || 'Không thể tạo sản phẩm');
    } finally { setSaving(false); }
  };

  const chooseImage = async () => {
    if (isPioneerPlan) {
      toast.error('Gói Tiên phong chỉ hỗ trợ ảnh từ URL');
      return;
    }
    try {
      const { openMediaPicker } = await import('zmp-sdk/apis');
      const { data } = await openMediaPicker({ type: 'photo', maxSelectItem: 1 });
      const uri = Array.isArray(data) ? data[0] : (typeof data === 'string' ? data : '');
      if (!uri) {
        toast.error('Không thể chọn ảnh');
        return;
      }
      setLocalImageUri(uri);
      setImageUrl('');
    } catch { toast.error('Hủy chọn ảnh'); }
  };

  return <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,23,42,.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={close}>
    <div style={{ width: '100%', maxWidth: 560, background: '#fff', borderRadius: '22px 22px 0 0', padding: 20 }} onClick={(event) => event.stopPropagation()}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}><div><b style={{ fontSize: 17 }}>Tạo nhanh sản phẩm</b><p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 12 }}>Lưu vào đơn ngay; sản phẩm sẽ được đánh dấu cần review.</p></div><button onClick={close} style={{ border: 0, background: 'none', fontSize: 20, color: '#64748b' }}>×</button></div>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 5 }}>Tên sản phẩm *</label><input autoFocus className="form-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ví dụ: Nước suối" style={{ width: '100%', marginBottom: 12 }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}><div><label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 5 }}>Giá bán *</label><input inputMode="numeric" className="form-input" value={price} onChange={(e) => setPrice(maskMoney(e.target.value))} placeholder="0" style={{ width: '100%', textAlign: 'right' }} /></div><div><label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 5 }}>Đơn vị</label><input className="form-input" value={unit} onChange={(e) => setUnit(e.target.value)} style={{ width: '100%' }} /></div></div>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, margin: '12px 0 5px' }}>Barcode</label><div style={{ display: 'flex', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}><input className="form-input" value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="Tự điền khi quét" style={{ flex: 1, border: 0 }} /><button type="button" onClick={() => setIsScannerOpen(true)} title="Quét barcode" style={{ width: 44, border: 0, borderLeft: '1px solid #e2e8f0', background: '#fff7ed', color: '#ea580c', display: 'grid', placeItems: 'center' }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 4H5a1 1 0 0 0-1 1v3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M4 16v3a1 1 0 0 0 1 1h3" /><path d="M8 12h8" /></svg></button></div>
      <button type="button" onClick={() => setShowMore((value) => !value)} style={{ border: 0, background: 'none', color: '#ea580c', fontWeight: 700, fontSize: 12, padding: '12px 0 0' }}>{showMore ? 'Ẩn thông tin mở rộng' : 'Thêm ảnh / thông tin mở rộng'}</button>
      {showMore && <div style={{ marginTop: 10, padding: 12, borderRadius: 12, background: '#f8fafc' }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 5 }}>Danh mục</label><select className="form-input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} style={{ width: '100%' }}><option value="">Chưa phân loại</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}><div><label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 5 }}>Giá vốn</label><input inputMode="numeric" className="form-input" value={costPrice} onChange={(e) => setCostPrice(maskMoney(e.target.value))} placeholder="0" style={{ width: '100%', textAlign: 'right' }} /></div><div><label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 5 }}>Giá sàn</label><input inputMode="numeric" className="form-input" value={minPrice} onChange={(e) => setMinPrice(maskMoney(e.target.value))} placeholder="0" style={{ width: '100%', textAlign: 'right' }} /></div></div>
        <div style={{ marginTop: 12, textAlign: 'center' }}>{localImageUri || imageUrl ? <div style={{ position: 'relative', display: 'inline-block' }}><img src={localImageUri || imageUrl} alt="Ảnh sản phẩm" style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 16, border: '1px solid #e2e8f0' }} /><button onClick={() => { setLocalImageUri(null); setImageUrl(''); }} style={{ position: 'absolute', right: -8, top: -8, border: '2px solid white', width: 24, height: 24, borderRadius: 12, background: '#ef4444', color: 'white' }}>×</button></div> : <div style={{ width: 96, height: 96, margin: 'auto', borderRadius: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', color: '#94a3b8', border: '1px solid #e2e8f0' }}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></svg><span style={{ fontSize: 10, marginTop: 4 }}>Thêm ảnh</span></div>}<div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 10 }}>{!isPioneerPlan && <button type="button" onClick={chooseImage} className="zaui-btn zaui-btn-tertiary">Chọn ảnh</button>}<button type="button" onClick={() => setShowUrlInput((value) => !value)} className="zaui-btn zaui-btn-tertiary">URL ảnh</button></div>{isPioneerPlan && <p style={{ margin: '8px 0 0', fontSize: 11, color: '#64748b' }}>Gói Tiên phong chỉ hỗ trợ ảnh từ URL.</p>}{showUrlInput && <input className="form-input" value={imageUrl} onChange={(e) => { setImageUrl(e.target.value); setLocalImageUri(null); }} placeholder="https://..." style={{ width: '100%', marginTop: 10 }} />}</div>
      </div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}><button onClick={close} disabled={saving} className="zaui-btn zaui-btn-tertiary">Huỷ</button><button onClick={save} disabled={saving} className="zaui-btn zaui-btn-primary">{saving ? 'Đang lưu...' : 'Lưu vào đơn'}</button></div>
    </div>
    <BarcodeScannerModal visible={isScannerOpen} onClose={() => setIsScannerOpen(false)} onScan={(code) => { setBarcode(code); setIsScannerOpen(false); }} title="Quét barcode sản phẩm" />
  </div>;
}
