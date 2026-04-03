import React, { useState, useEffect, useRef } from 'react';
import { collection, onSnapshot, query, orderBy, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { motion, AnimatePresence, useScroll, useTransform } from 'motion/react';
import { Heart, ShoppingCart, ChevronDown, Plus, Minus, X, CheckCircle, Phone, User, MapPin, Settings, Loader2, ArrowRight, MessageCircle } from 'lucide-react';
import { cn } from '../lib/utils';

// Helper to render image or video based on URL
const MediaRenderer = ({ src, className, ...props }: any) => {
  if (!src) return <img src="https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&q=80&w=800" className={className} referrerPolicy="no-referrer" loading="lazy" {...props} />;
  
  const isVideo = src.match(/\.(mp4|webm|ogg|mov)(\?.*)?$/i) || src.startsWith('data:video/') || src.includes('video%2F');
  
  if (isVideo) {
    return <video src={src} className={className} autoPlay muted loop playsInline preload="metadata" {...props} />;
  }
  return <img src={src} className={className} referrerPolicy="no-referrer" loading="lazy" {...props} />;
};

interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  imageUrl: string;
  unit: string;
  inStock: boolean;
}

interface CartItem extends MenuItem {
  quantity: number;
}

export default function ClientApp() {
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [selectionQty, setSelectionQty] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState<any | null>(null);
  const [stockError, setStockError] = useState<string | null>(null);
  const [customerInfo, setCustomerInfo] = useState({ name: '', phone: '', city: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const q = query(collection(db, 'menu'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MenuItem));
      setMenu(items.filter(i => i.inStock));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'menu');
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (selectedItem) setSelectionQty(1);
  }, [selectedItem]);

  const addToCart = (item: MenuItem, quantity: number) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (existing) {
        return prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + quantity } : i);
      }
      return [...prev, { ...item, quantity }];
    });
    setSelectedItem(null);
  };

  const removeFromCart = (id: string) => {
    setCart(prev => prev.filter(i => i.id !== id));
  };

  const updateQuantity = (id: string, delta: number) => {
    setCart(prev => prev.map(i => {
      if (i.id === id) {
        const isWeight = i.unit.includes('גרם') || i.unit.includes('ק״ג');
        const step = isWeight ? 0.1 : 1;
        const actualDelta = delta > 0 ? step : -step;
        const newQty = Math.max(0, i.quantity + actualDelta);
        return { ...i, quantity: Number(newQty.toFixed(2)) };
      }
      return i;
    }).filter(i => i.quantity > 0));
  };

  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!customerInfo.name.trim()) newErrors.name = 'שדה חובה';
    if (!customerInfo.phone.trim()) newErrors.phone = 'שדה חובה';
    else if (!/^05\d{8}$/.test(customerInfo.phone.replace(/\D/g, ''))) newErrors.phone = 'מספר טלפון לא תקין (05xxxxxxxx)';
    if (!customerInfo.city.trim()) newErrors.city = 'שדה חובה';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const submitOrder = async () => {
    if (isSubmitting) return;
    if (!validate()) return;

    setIsSubmitting(true);
    setErrors({});

    // Check if all items in cart are still in stock
    const outOfStockItems = cart.filter(cartItem => {
      const menuItem = menu.find(m => m.id === cartItem.id);
      return !menuItem || !menuItem.inStock;
    });

    if (outOfStockItems.length > 0) {
      setStockError(`מצטערים, הפריטים הבאים אזלו מהמלאי: ${outOfStockItems.map(i => i.name).join(', ')}`);
      setCart(prev => prev.filter(i => !outOfStockItems.find(oi => oi.id === i.id)));
      setIsSubmitting(false);
      return;
    }

    const orderNumber = Math.floor(1000 + Math.random() * 9000).toString();
    const orderData = {
      orderNumber,
      customerName: customerInfo.name.trim(),
      customerPhone: customerInfo.phone.trim(),
      customerCity: customerInfo.city.trim(),
      items: cart.map(i => ({
        menuItemId: i.id,
        name: i.name,
        quantity: i.quantity,
        price: i.price,
        unit: i.unit
      })),
      total,
      status: 'pending',
      createdAt: serverTimestamp()
    };

    try {
      await addDoc(collection(db, 'orders'), orderData);
      setOrderSuccess(orderData);
      setCart([]);
      setIsCheckoutOpen(false);
    } catch (e) {
      console.error("Order submission failed:", e);
      handleFirestoreError(e, OperationType.CREATE, 'orders');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (orderSuccess) {
      // Generate WhatsApp message
      const whatsappMessage = `היי איה! ביצעתי הזמנה מספר ${orderSuccess.orderNumber}.\n\nסיכום הזמנה:\n${orderSuccess.items.map((i: any) => `${i.name} - ${i.quantity} ${i.unit}`).join('\n')}\n\nסה״כ לתשלום: ₪${orderSuccess.total}\n\nשם: ${orderSuccess.customerName}\nטלפון: ${orderSuccess.customerPhone}\nעיר: ${orderSuccess.customerCity}`;
      const whatsappUrl = `https://wa.me/972526590006?text=${encodeURIComponent(whatsappMessage)}`;

    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center bg-brand-cream">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="w-20 h-20 bg-brand-red rounded-full flex items-center justify-center mb-6"
        >
          <CheckCircle className="text-white w-10 h-10" />
        </motion.div>
        <h2 className="text-4xl md:text-5xl font-display text-brand-red mb-4">הזמנתך נקלטה!</h2>
        <p className="text-brand-blue font-bold text-xl mb-2">התשלום מתבצע במקום (ולא באונליין).</p>
        <p className="text-brand-blue font-medium mb-8">ההזמנה בוצעה בהצלחה ונמצאת כעת בהכנה.</p>
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-brand-red/10 mb-8 w-full max-w-xs">
          <p className="text-xs uppercase tracking-widest text-gray-400 mb-1">מספר הזמנה</p>
          <p className="text-4xl font-mono font-bold text-brand-red">#{orderSuccess.orderNumber}</p>
        </div>
        <div className="flex flex-col gap-4 w-full max-w-xs">
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-[#25D366] text-white px-6 py-4 rounded-full font-medium hover:bg-[#20bd5a] transition-colors shadow-lg flex items-center justify-center gap-2"
          >
            <MessageCircle className="w-6 h-6" />
            <span>שלח הודעת וואטסאפ לאישור</span>
          </a>
          <button
            onClick={() => setOrderSuccess(null)}
            className="bg-brand-red text-white px-8 py-4 rounded-full font-medium hover:bg-brand-red/90 transition-colors shadow-lg"
          >
            חזרה לתפריט
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-screen overflow-hidden bg-brand-cream">
      {/* Header */}
      <header className="absolute top-0 left-0 right-0 z-40 p-4 px-6 md:px-12 flex justify-between items-center bg-brand-cream/95 backdrop-blur-md shadow-md border-b border-brand-red/10 pointer-events-none">
        <div className="max-w-7xl mx-auto w-full flex justify-between items-center pointer-events-auto">
          <div className="flex flex-col">
            <h1 className="text-brand-red text-4xl md:text-5xl font-display font-bold tracking-widest">איה בר-און</h1>
            <span className="text-brand-blue text-sm md:text-lg font-display tracking-widest font-bold mt-0.5">פשוט. מבשלת.</span>
          </div>
          <div className="flex items-center gap-4 md:gap-6">
            <button
              onClick={() => window.location.hash = 'admin'}
              className="p-2 text-brand-blue/70 hover:text-brand-red transition-colors"
            >
              <Settings className="w-5 h-5 md:w-6 md:h-6" />
            </button>
            <button
              onClick={() => setIsCartOpen(true)}
              className="relative p-2 text-brand-red hover:scale-105 transition-transform"
            >
              <ShoppingCart className="w-6 h-6 md:w-8 md:h-8" />
              {cart.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-brand-blue text-white text-[10px] md:text-[12px] w-5 h-5 md:w-6 md:h-6 rounded-full flex items-center justify-center font-bold shadow-sm">
                  {cart.length}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Reels-like Scroll Container */}
      <div className="h-full pt-20 md:pt-24 pb-0 overflow-y-scroll snap-y snap-mandatory scrollbar-hide">
        {menu.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center bg-brand-cream text-brand-red font-display text-4xl">
            <span>התפריט ריק כרגע...</span>
            <span className="text-brand-blue text-2xl mt-2">בקרוב יעלו מנות חדשות!</span>
          </div>
        ) : (
          menu.map((item) => (
            <div key={item.id} className="h-full w-full snap-start relative flex flex-col justify-end p-6 md:p-12 text-right">
              {/* Background Image */}
              <div className="absolute inset-0 z-0">
                <MediaRenderer
                  src={item.imageUrl || `https://picsum.photos/seed/${item.id}/800/1200`}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
              </div>

              {/* Content */}
              <div className="relative z-10 mb-20 md:mb-32 max-w-7xl mx-auto w-full pl-24 md:pl-32">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <h2 className="text-white text-4xl md:text-6xl font-serif font-bold mb-2 md:mb-4 drop-shadow-lg">{item.name}</h2>
                  <p className="text-white/90 text-sm md:text-xl md:leading-relaxed mb-6 md:mb-8 max-w-[90%] md:max-w-[70%] ml-auto drop-shadow-md font-medium">{item.description}</p>
                  <div className="flex items-center gap-4 justify-end">
                    <div className="bg-brand-red text-white px-5 py-2 md:px-6 md:py-3 rounded-full flex items-center gap-3 shadow-2xl border border-white/20 backdrop-blur-md">
                      <span className="text-2xl md:text-4xl font-bold tracking-tight">₪{item.price}</span>
                      <div className="w-px h-6 md:h-8 bg-white/30"></div>
                      <span className="text-white/90 text-sm md:text-base font-medium uppercase tracking-widest">ל-{item.unit}</span>
                    </div>
                  </div>
                </motion.div>
              </div>

              {/* Action Buttons */}
              <div className="absolute left-6 md:left-12 bottom-32 md:bottom-40 z-20 flex flex-col gap-2 items-center">
                <motion.button
                  whileTap={{ scale: 0.8 }}
                  onClick={() => setSelectedItem(item)}
                  className="w-14 h-14 md:w-20 md:h-20 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center text-white border border-white/20 hover:bg-white/20 transition-colors shadow-2xl"
                >
                  <Heart className="w-6 h-6 md:w-8 md:h-8" />
                </motion.button>
                <span className="text-white font-bold drop-shadow-md text-sm md:text-base tracking-widest">הזמן</span>
                <div className="text-center text-white/90 text-[10px] md:text-xs uppercase tracking-tighter drop-shadow-md font-bold mt-4">החליקו למעלה</div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Selection Bottom Sheet */}
      <AnimatePresence>
        {selectedItem && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedItem(null)}
              className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="fixed bottom-0 left-0 right-0 bg-white rounded-t-[40px] z-50 p-8 pb-12"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-serif italic">{selectedItem.name}</h3>
                <button onClick={() => setSelectedItem(null)} className="p-2 bg-gray-100 rounded-full text-gray-500 hover:bg-gray-200">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-gray-500 text-sm mb-8">כמה תרצו להזמין?</p>

              <div className="flex items-center justify-between mb-8 bg-[#f5f2ed] p-4 rounded-3xl">
                <button
                  onClick={() => setSelectionQty(prev => Math.max(0.1, prev - (selectedItem.unit.includes('גרם') || selectedItem.unit.includes('ק״ג') ? 0.1 : 1)))}
                  className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm"
                >
                  <Minus className="w-5 h-5" />
                </button>
                <div className="text-center">
                  <span className="text-3xl font-mono font-bold">{selectionQty.toFixed(selectedItem.unit.includes('גרם') || selectedItem.unit.includes('ק״ג') ? 1 : 0)}</span>
                  <span className="text-gray-400 mr-2">{selectedItem.unit}</span>
                </div>
                <button
                  onClick={() => setSelectionQty(prev => prev + (selectedItem.unit.includes('גרם') || selectedItem.unit.includes('ק״ג') ? 0.1 : 1))}
                  className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>

              <button
                onClick={() => addToCart(selectedItem, selectionQty)}
                className="w-full bg-[#5A5A40] text-white py-5 rounded-full font-medium text-lg shadow-xl shadow-[#5A5A40]/20"
              >
                הוספה לסל • ₪{(selectedItem.price * selectionQty).toFixed(2)}
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Cart Drawer */}
      <AnimatePresence>
        {isCartOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCartOpen(false)}
              className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm"
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              className="fixed top-0 left-0 bottom-0 w-full max-w-md bg-[#f5f2ed] z-50 flex flex-col"
            >
              <div className="p-6 flex justify-between items-center border-b border-[#5A5A40]/10">
                <div className="flex items-center gap-3">
                  <button onClick={() => setIsCartOpen(false)} className="p-2 bg-white rounded-full shadow-sm text-gray-500 hover:text-brand-red">
                    <ArrowRight className="w-5 h-5" />
                  </button>
                  <h3 className="text-xl font-serif italic">הסל שלך</h3>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {cart.length === 0 ? (
                  <div className="text-center py-20 text-gray-400 italic">הסל שלך ריק</div>
                ) : (
                  cart.map((item) => (
                    <div key={item.id} className="flex gap-4 bg-white p-4 rounded-3xl shadow-sm">
                      <MediaRenderer src={item.imageUrl} className="w-20 h-20 rounded-2xl object-cover" />
                      <div className="flex-1">
                        <div className="flex justify-between mb-1">
                          <h4 className="font-medium">{item.name}</h4>
                          <button onClick={() => removeFromCart(item.id)} className="text-gray-300 hover:text-red-400">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        <p className="text-xs text-gray-400 mb-3">₪{item.price} / {item.unit}</p>
                        <div className="flex items-center gap-3">
                          <button onClick={() => updateQuantity(item.id, -1)} className="w-6 h-6 bg-[#f5f2ed] rounded-lg flex items-center justify-center"><Minus className="w-3 h-3" /></button>
                          <span className="font-mono text-sm">{item.quantity}</span>
                          <button onClick={() => updateQuantity(item.id, 1)} className="w-6 h-6 bg-[#f5f2ed] rounded-lg flex items-center justify-center"><Plus className="w-3 h-3" /></button>
                          <span className="mr-auto font-mono font-bold">₪{item.price * item.quantity}</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {cart.length > 0 && (
                <div className="p-6 bg-white border-t border-[#5A5A40]/10 rounded-t-[40px] shadow-2xl">
                  <div className="bg-orange-50 border-2 border-orange-200 text-orange-800 px-4 py-4 rounded-2xl mb-4 text-sm text-center font-bold shadow-sm">
                    ⚠️ שימו לב: ההזמנה הינה לאיסוף עצמי מהמסעדה בהיוגב
                  </div>
                  <div className="flex justify-between mb-6">
                    <span className="text-gray-400">סה״כ</span>
                    <span className="text-2xl font-mono font-bold">₪{total}</span>
                  </div>
                  <button
                    onClick={() => { setIsCartOpen(false); setIsCheckoutOpen(true); }}
                    className="w-full bg-[#5A5A40] text-white py-5 rounded-full font-medium text-lg"
                  >
                    לקופה
                  </button>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Checkout Modal */}
      <AnimatePresence>
        {isCheckoutOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCheckoutOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative bg-white w-full max-w-md rounded-[40px] p-8 overflow-hidden max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center gap-3 mb-6">
                <button onClick={() => setIsCheckoutOpen(false)} className="p-2 bg-gray-100 rounded-full text-gray-500 hover:text-brand-red">
                  <ArrowRight className="w-5 h-5" />
                </button>
                <h3 className="text-2xl font-serif italic">השלמת הזמנה</h3>
              </div>
              <div className="bg-orange-50 border-2 border-orange-200 text-orange-800 px-4 py-4 rounded-2xl mb-6 text-sm text-center font-bold shadow-sm">
                ⚠️ ההזמנה הינה לאיסוף עצמי מהמסעדה בהיוגב
              </div>
              <div className="space-y-4 mb-8">
                <div>
                  <label className="block text-[10px] uppercase tracking-widest text-gray-400 mb-1 mr-4">שם מלא</label>
                  <div className="relative">
                    <User className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
                    <input
                      type="text"
                      value={customerInfo.name}
                      onChange={e => setCustomerInfo({ ...customerInfo, name: e.target.value })}
                      className={cn("w-full bg-[#f5f2ed] rounded-2xl py-4 pr-12 pl-4 outline-none focus:ring-2 ring-[#5A5A40]/20", errors.name && "ring-red-200")}
                      placeholder="איה בר-און"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-widest text-gray-400 mb-1 mr-4">מספר טלפון</label>
                  <div className="relative">
                    <Phone className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
                    <input
                      type="tel"
                      value={customerInfo.phone}
                      onChange={e => setCustomerInfo({ ...customerInfo, phone: e.target.value })}
                      className={cn("w-full bg-[#f5f2ed] rounded-2xl py-4 pr-12 pl-4 outline-none focus:ring-2 ring-[#5A5A40]/20", errors.phone && "ring-red-200")}
                      placeholder="0526590006"
                    />
                  </div>
                  {errors.phone && <p className="text-[10px] text-red-400 mt-1 mr-4">{errors.phone}</p>}
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-widest text-gray-400 mb-1 mr-4">עיר</label>
                  <div className="relative">
                    <MapPin className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
                    <input
                      type="text"
                      value={customerInfo.city}
                      onChange={e => setCustomerInfo({ ...customerInfo, city: e.target.value })}
                      className={cn("w-full bg-[#f5f2ed] rounded-2xl py-4 pr-12 pl-4 outline-none focus:ring-2 ring-[#5A5A40]/20", errors.city && "ring-red-200")}
                      placeholder="תל אביב"
                    />
                  </div>
                </div>
              </div>

              <button
                onClick={submitOrder}
                disabled={isSubmitting}
                className="w-full bg-[#5A5A40] text-white py-5 rounded-full font-medium text-lg flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    מעבד הזמנה...
                  </>
                ) : (
                  <>ביצוע הזמנה • ₪{total}</>
                )}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Stock Error Modal */}
      <AnimatePresence>
        {stockError && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setStockError(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative bg-white w-full max-w-md rounded-[40px] p-12 border border-brand-red/10 text-center"
            >
              <div className="w-20 h-20 bg-brand-red/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <X className="w-10 h-10 text-brand-red" />
              </div>
              <h3 className="text-3xl font-display text-brand-red mb-4">אזל מהמלאי</h3>
              <p className="text-brand-blue font-display text-lg mb-8">{stockError}</p>
              <button
                onClick={() => setStockError(null)}
                className="w-full bg-brand-red text-white py-4 rounded-full font-medium hover:bg-brand-red/90 transition-all shadow-lg shadow-brand-red/20"
              >
                הבנתי
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
