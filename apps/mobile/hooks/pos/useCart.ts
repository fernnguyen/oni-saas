import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { db } from '../../lib/db/client';
import * as schema from '../../lib/db/schema';
import { eq } from 'drizzle-orm';

export function useCart(isNavReady: boolean, isLoading: boolean) {
  const [cart, setCart] = useState<{[cartItemId: string]: any}>({});
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [previewProduct, setPreviewProduct] = useState<any>(null);
  const [previewQuantity, setPreviewQuantity] = useState<number>(1);
  const [selectedVariant, setSelectedVariant] = useState<any>(null);
  const [selectedModifiers, setSelectedModifiers] = useState<any[]>([]);

  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [orderNote, setOrderNote] = useState('');

  const addToCart = async (product: any) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    
    let resolvedTaxRate = product.tax_rate;
    let resolvedTaxGroup = product.tax_group;
    let resolvedInputTaxRate = product.input_tax_rate;

    if ((!resolvedTaxRate || resolvedTaxRate === '0' || !resolvedTaxGroup) && product.category_id) {
      try {
        const catRes = await db
          .select()
          .from(schema.categories)
          .where(eq(schema.categories.id, product.category_id))
          .limit(1);
        if (catRes.length > 0) {
          const category = catRes[0];
          resolvedTaxRate = resolvedTaxRate && resolvedTaxRate !== '0' ? resolvedTaxRate : (category.tax_rate || '0');
          resolvedTaxGroup = resolvedTaxGroup || category.tax_group || '';
          resolvedInputTaxRate = resolvedInputTaxRate && resolvedInputTaxRate !== '0' ? resolvedInputTaxRate : (category.tax_rate || '0');
        }
      } catch (err) {
        console.error('[Cart Hook] Failed to resolve category tax fallback:', err);
      }
    }

    setPreviewProduct({
      ...product,
      original_price: product.sell_price,
      tax_rate: resolvedTaxRate || '0',
      tax_group: resolvedTaxGroup || '',
      input_tax_rate: resolvedInputTaxRate || '0',
    });
    setPreviewQuantity(1);
    setSelectedVariant(null);
    setSelectedModifiers([]);
    setIsPreviewModalOpen(true);
  };

  const handleConfirmAddToCart = () => {
    if (!previewProduct) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    
    const variantLabel = selectedVariant ? selectedVariant.option : undefined;
    const modifierTotal = selectedModifiers.reduce((sum, m) => sum + (Number(m.price_adj) || 0), 0);
    const modifiersHash = selectedModifiers.map(m => m.option).sort().join(',');
    
    const cartItemId = `${previewProduct.id}_${variantLabel || 'none'}_${modifiersHash || 'none'}`;
    
    setCart(prev => {
      const existing = prev[cartItemId];
      return {
        ...prev,
        [cartItemId]: {
          productId: previewProduct.id,
          name: previewProduct.name,
          price: Math.max(0, previewProduct.sell_price - (previewProduct.discount_amount || 0)),
          original_price: previewProduct.original_price,
          quantity: existing ? existing.quantity + previewQuantity : previewQuantity,
          variant_label: variantLabel,
          modifiers: selectedModifiers,
          modifier_total: modifierTotal,
          discount_amount: previewProduct.discount_amount || 0,
          discount_pct: previewProduct.discount_pct || 0,
          tax_rate: previewProduct.tax_rate || '0',
          input_tax_rate: previewProduct.input_tax_rate || '0',
          tax_group: previewProduct.tax_group || '',
        }
      };
    });
    setIsPreviewModalOpen(false);
  };

  const removeFromCart = (cartItemId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setCart(prev => {
      const newCart = { ...prev };
      delete newCart[cartItemId];
      return newCart;
    });
  };

  const updateCartItemQuantity = (cartItemId: string, newQty: number) => {
    if (newQty < 1) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setCart(prev => {
      const existing = prev[cartItemId];
      if (!existing) return prev;
      return {
        ...prev,
        [cartItemId]: {
          ...existing,
          quantity: newQty
        }
      };
    });
  };

  const getCartTotal = () => {
    return Object.values(cart).reduce((sum, item) => sum + ((item.price + (item.modifier_total || 0)) * item.quantity), 0);
  };
  
  const getCartCount = () => {
    return Object.values(cart).reduce((sum, item) => sum + item.quantity, 0);
  };

  useEffect(() => {
    if (!isNavReady) return;
    const loadTempCart = async () => {
      try {
        const savedCart = await AsyncStorage.getItem('temp_cart');
        if (savedCart) {
          const parsed = JSON.parse(savedCart);
          if (Object.keys(parsed).length > 0) {
            setCart(parsed);
          }
        }
        const savedDiscount = await AsyncStorage.getItem('temp_discount');
        if (savedDiscount) {
          setDiscountAmount(parseInt(savedDiscount, 10) || 0);
        }
        const savedNote = await AsyncStorage.getItem('temp_note');
        if (savedNote) {
          setOrderNote(savedNote);
        }
        const savedCustomer = await AsyncStorage.getItem('temp_customer');
        if (savedCustomer) {
          setSelectedCustomer(JSON.parse(savedCustomer));
        }
      } catch (err) {
        console.error('Không thể tải lại giỏ hàng tạm thời từ AsyncStorage:', err);
      }
    };
    loadTempCart();
  }, [isNavReady]);

  useEffect(() => {
    if (!isNavReady || isLoading) return;
    const saveCartToStorage = async () => {
      try {
        await AsyncStorage.setItem('temp_cart', JSON.stringify(cart));
      } catch (err) {
        console.error('Không thể lưu giỏ hàng tạm thời:', err);
      }
    };
    saveCartToStorage();
  }, [cart, isNavReady, isLoading]);

  useEffect(() => {
    if (!isNavReady || isLoading) return;
    const saveCheckoutStates = async () => {
      try {
        await AsyncStorage.setItem('temp_discount', discountAmount.toString());
        await AsyncStorage.setItem('temp_note', orderNote);
        if (selectedCustomer) {
          await AsyncStorage.setItem('temp_customer', JSON.stringify(selectedCustomer));
        } else {
          await AsyncStorage.removeItem('temp_customer');
        }
      } catch (err) {
        console.error('Không thể lưu trạng thái thanh toán tạm thời:', err);
      }
    };
    saveCheckoutStates();
  }, [discountAmount, orderNote, selectedCustomer, isNavReady, isLoading]);

  return {
    cart, setCart,
    isPreviewModalOpen, setIsPreviewModalOpen,
    previewProduct, setPreviewProduct,
    previewQuantity, setPreviewQuantity,
    selectedVariant, setSelectedVariant,
    selectedModifiers, setSelectedModifiers,
    selectedCustomer, setSelectedCustomer,
    discountAmount, setDiscountAmount,
    orderNote, setOrderNote,
    addToCart, handleConfirmAddToCart, removeFromCart, updateCartItemQuantity, getCartTotal, getCartCount
  };
}
