import React, { useState, useEffect, useRef } from 'react';
import { collection, onSnapshot, query, orderBy, updateDoc, doc, deleteDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { signInWithEmailAndPassword, signOut, signInAnonymously, signInWithPopup, GoogleAuthProvider, onAuthStateChanged } from 'firebase/auth';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, auth, storage, handleFirestoreError, OperationType } from '../lib/firebase';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";
import { LayoutDashboard, UtensilsCrossed, ClipboardList, LogOut, Plus, Trash2, Check, X, Clock, Package, Bell, Printer, Mail, Sparkles, Loader2, RefreshCw, Edit2, Upload, MessageCircle, Save, Download } from 'lucide-react';
import { cn } from '../lib/utils';
import { format } from 'date-fns';

interface Order {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  customerCity: string;
  items: any[];
  total: number;
  status: 'pending' | 'confirmed' | 'ready' | 'delivered' | 'cancelled';
  createdAt: any;
}

interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  imageUrl: string;
  unit: string;
  inStock: boolean;
}

// Helper to render image or video based on URL
const MediaRenderer = ({ src, className, ...props }: any) => {
  if (!src) return <img src="https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&q=80&w=800" className={className} referrerPolicy="no-referrer" {...props} />;
  
  const isVideo = src.match(/\.(mp4|webm|ogg|mov)(\?.*)?$/i) || src.startsWith('data:video/') || src.includes('video%2F');
  
  if (isVideo) {
    return <video src={src} className={className} autoPlay muted loop playsInline {...props} />;
  }
  return <img src={src} className={className} referrerPolicy="no-referrer" {...props} />;
};

// Helper to compress base64 images
const compressImage = (base64: string): Promise<string> => {
  if (!base64.startsWith('data:image')) return Promise.resolve(base64);
  
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = base64;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX_WIDTH = 800;
      const MAX_HEIGHT = 800;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        }
      } else {
        if (height > MAX_HEIGHT) {
          width *= MAX_HEIGHT / height;
          height = MAX_HEIGHT;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = (err) => reject(err);
  });
};

export default function AdminApp() {
  const [user, setUser] = useState(auth.currentUser);
  const [activeTab, setActiveTab] = useState<'orders' | 'menu'>('orders');
  const [orders, setOrders] = useState<Order[]>([]);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [newItem, setNewItem] = useState({ name: '', description: '', price: 0, unit: 'יחידה', imageUrl: '' });
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [isManualAdmin, setIsManualAdmin] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [savedMenus, setSavedMenus] = useState<any[]>([]);
  const [isSavingMenuModalOpen, setIsSavingMenuModalOpen] = useState(false);
  const [isLoadMenuModalOpen, setIsLoadMenuModalOpen] = useState(false);
  const [menuName, setMenuName] = useState('');
  const prevOrdersCount = useRef(0);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setError(null);

    try {
      // Create a reference to the file in Firebase Storage
      const fileRef = ref(storage, `menu/${Date.now()}_${file.name}`);
      
      // Upload the file
      await uploadBytes(fileRef, file);
      
      // Get the download URL
      const downloadURL = await getDownloadURL(fileRef);
      
      setNewItem(prev => ({ ...prev, imageUrl: downloadURL }));
    } catch (err: any) {
      console.error("File upload failed", err);
      setError(`שגיאה בהעלאת הקובץ: ${err.message || 'וודא ש-Firebase Storage מוגדר כראוי.'}`);
    } finally {
      setIsUploading(false);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    const qOrders = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
    const unsubOrders = onSnapshot(qOrders, (snapshot) => {
      const newOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
      // Sound notification for new orders
      if (newOrders.length > prevOrdersCount.current && prevOrdersCount.current > 0) {
        const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
        audio.play().catch(() => {});
      }
      prevOrdersCount.current = newOrders.length;
      setOrders(newOrders);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'orders');
      setError('שגיאה בטעינת הזמנות. אנא רענן את העמוד.');
    });

    const qMenu = query(collection(db, 'menu'), orderBy('createdAt', 'desc'));
    const unsubMenu = onSnapshot(qMenu, (snapshot) => {
      setMenu(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MenuItem)));
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'menu');
      setError('שגיאה בטעינת התפריט. אנא רענן את העמוד.');
    });

    const qSavedMenus = query(collection(db, 'savedMenus'), orderBy('createdAt', 'desc'));
    const unsubSavedMenus = onSnapshot(qSavedMenus, (snapshot) => {
      setSavedMenus(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'savedMenus');
      setError('שגיאת הרשאות: חוקי האבטחה (Security Rules) התעדכנו. אנא רענן את העמוד כדי לטעון מחדש.');
    });

    return () => {
      unsubOrders();
      unsubMenu();
      unsubSavedMenus();
    };
  }, [user]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoggingIn) return;
    setIsLoggingIn(true);
    setError(null);
    
    const email = loginForm.email.trim();
    const password = loginForm.password.trim();

    try {
      await signInWithEmailAndPassword(auth, email, password);
      setIsManualAdmin(true);
    } catch (err: any) {
      console.error("Firebase Auth failed", err);
      
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError('שם משתמש או סיסמה שגויים');
      } else if (err.code === 'auth/operation-not-allowed') {
        setError('שגיאה: יש להפעיל "Email/Password" ב-Firebase Console (תחת Authentication > Sign-in method).');
      } else if (err.code === 'auth/invalid-email') {
        setError('כתובת אימייל לא חוקית. יש להזין כתובת אימייל מלאה (לדוגמה: admin@example.com).');
      } else if (err.code === 'auth/network-request-failed') {
        setError('שגיאת חיבור: וודא שאתה מחובר לאינטרנט וש-Firebase מוגדר כראוי.');
      } else {
        setError(`שגיאה בהתחברות: ${err.message}`);
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const generateAIImage = async () => {
    if (!newItem.name || !newItem.description) {
      setError('יש להזין שם ותיאור למנה כדי לייצר תמונה');
      return;
    }

    setIsGeneratingImage(true);
    setError(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const prompt = `Generate an appetizing food photography image for a restaurant menu. Dish name: ${newItem.name}. Description: ${newItem.description}. High resolution, elegant presentation, warm lighting, shallow depth of field.`;
      
      // Retry logic for AI generation
      let response;
      let retries = 3;
      while (retries > 0) {
        try {
          response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: {
              parts: [{ text: prompt }],
            },
            config: {
              imageConfig: {
                aspectRatio: "1:1",
              }
            }
          });
          break;
        } catch (e) {
          retries--;
          if (retries === 0) throw e;
          await new Promise(r => setTimeout(r, 1000));
        }
      }

      let imageUrl = '';
      let textResponse = '';
      let finishReason = '';
      
      if (response && response.candidates && response.candidates[0]) {
        finishReason = response.candidates[0].finishReason || '';
        const content = response.candidates[0].content;
        if (content && content.parts) {
          for (const part of content.parts) {
            if (part.inlineData) {
              imageUrl = `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
              break;
            } else if (part.text) {
              textResponse += part.text;
            }
          }
        }
      }

      if (imageUrl) {
        try {
          const compressed = await compressImage(imageUrl);
          setNewItem(prev => ({ ...prev, imageUrl: compressed }));
        } catch (e) {
          console.error("Compression failed", e);
          setNewItem(prev => ({ ...prev, imageUrl }));
        }
      } else {
        console.error("AI Response without image:", response);
        if (finishReason === 'SAFETY') {
          throw new Error('הבקשה נחסמה מסיבות בטיחות. נסה לשנות את שם או תיאור המנה.');
        } else if (textResponse) {
          throw new Error(`המודל החזיר טקסט במקום תמונה: ${textResponse}`);
        } else {
          throw new Error('לא נוצרה תמונה. ייתכן שהמודל עמוס כרגע, נסה שוב מאוחר יותר.');
        }
      }
    } catch (err: any) {
      console.error("AI Image generation failed", err);
      const errorMsg = err.message || '';
      if (errorMsg.includes('Rpc failed') || errorMsg.includes('xhr error')) {
        setError('שגיאת תקשורת עם שירות ה-AI. ייתכן שיש עומס זמני, נסו שוב בעוד מספר שניות.');
      } else {
        setError(errorMsg || 'יצירת תמונה ב-AI נכשלה. נסו שוב או הזינו כתובת ידנית.');
      }
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handlePrintOrder = (order: Order) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    
    const itemsHtml = order.items.map(item => `
      <div style="display: flex; justify-content: space-between; margin-bottom: 10px; border-bottom: 1px dashed #ccc; padding-bottom: 5px;">
        <span>${item.name}</span>
        <span>${item.quantity} x ₪${item.price}</span>
      </div>
    `).join('');

    printWindow.document.write(`
      <html dir="rtl" lang="he">
        <head>
          <title>הזמנה #${order.orderNumber}</title>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; padding: 20px; max-width: 400px; margin: 0 auto; }
            h1 { text-align: center; font-size: 24px; margin-bottom: 5px; }
            .meta { text-align: center; color: #666; margin-bottom: 20px; font-size: 14px; }
            .customer { background: #f5f5f5; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
            .total { font-size: 20px; font-weight: bold; text-align: left; margin-top: 20px; padding-top: 10px; border-top: 2px solid #000; }
          </style>
        </head>
        <body>
          <h1>הזמנה #${order.orderNumber}</h1>
          <div class="meta">${format(order.createdAt?.toDate() || new Date(), 'dd/MM/yyyy HH:mm')}</div>
          
          <div class="customer">
            <strong>${order.customerName}</strong><br>
            ${order.customerPhone}<br>
            ${order.customerCity}
          </div>
          
          <div class="items">
            ${itemsHtml}
          </div>
          
          <div class="total">
            סה"כ: ₪${order.total}
          </div>
          <script>
            window.onload = () => { window.print(); window.close(); }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleEmailOrder = (order: Order) => {
    const subject = encodeURIComponent(`הזמנה חדשה #${order.orderNumber} - איה בר-און`);
    let body = `הזמנה #${order.orderNumber}\n`;
    body += `תאריך: ${format(order.createdAt?.toDate() || new Date(), 'dd/MM/yyyy HH:mm')}\n\n`;
    body += `פרטי לקוח:\nשם: ${order.customerName}\nטלפון: ${order.customerPhone}\nעיר: ${order.customerCity}\n\n`;
    body += `פריטים:\n`;
    order.items.forEach(item => {
      body += `- ${item.name} (${item.quantity} x ₪${item.price})\n`;
    });
    body += `\nסה"כ לתשלום: ₪${order.total}\n`;
    
    window.location.href = `mailto:?subject=${subject}&body=${encodeURIComponent(body)}`;
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setIsManualAdmin(false);
      window.location.hash = '';
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  const updateOrderStatus = async (id: string, status: Order['status']) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await updateDoc(doc(db, 'orders', id), { status });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${id}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleStock = async (id: string, inStock: boolean) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await updateDoc(doc(db, 'menu', id), { inStock });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `menu/${id}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const deleteMenuItem = async (id: string) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await deleteDoc(doc(db, 'menu', id));
      setDeleteConfirmId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `menu/${id}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const deleteAllMenuItems = async () => {
    if (isSubmitting) return;
    if (!window.confirm('האם אתה בטוח שברצונך למחוק את כל המנות מהתפריט? פעולה זו אינה הפיכה.')) return;
    
    setIsSubmitting(true);
    try {
      // Delete all items one by one
      for (const item of menu) {
        await deleteDoc(doc(db, 'menu', item.id));
      }
      alert('כל המנות נמחקו בהצלחה');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'menu');
    } finally {
      setIsSubmitting(false);
    }
  };

  const saveCurrentMenu = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!menuName.trim()) {
      setError('נא להזין שם לתפריט');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const itemsToSave = menu.map(item => {
        const { id, createdAt, ...rest } = item as any;
        return rest;
      });
      
      await addDoc(collection(db, 'savedMenus'), {
        name: menuName.trim(),
        items: itemsToSave,
        createdAt: serverTimestamp()
      });
      
      setIsSavingMenuModalOpen(false);
      setMenuName('');
      alert('התפריט נשמר בהצלחה');
    } catch (error: any) {
      console.error("Error saving menu:", error);
      setError(`שגיאה בשמירת התפריט: ${error.message}`);
      try { handleFirestoreError(error, OperationType.CREATE, 'savedMenus'); } catch(e) {}
    } finally {
      setIsSubmitting(false);
    }
  };

  const loadSavedMenu = async (savedMenu: any) => {
    if (isSubmitting) return;
    if (!window.confirm(`האם אתה בטוח שברצונך לטעון את התפריט "${savedMenu.name}"? זה יוסיף את המנות לתפריט הנוכחי.`)) return;
    
    setIsSubmitting(true);
    try {
      for (const item of savedMenu.items) {
        await addDoc(collection(db, 'menu'), {
          ...item,
          createdAt: serverTimestamp()
        });
      }
      setIsLoadMenuModalOpen(false);
      alert('התפריט נטען בהצלחה');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'menu');
    } finally {
      setIsSubmitting(false);
    }
  };

  const deleteSavedMenu = async (id: string) => {
    if (isSubmitting) return;
    if (!window.confirm('האם אתה בטוח שברצונך למחוק תפריט שמור זה?')) return;
    
    setIsSubmitting(true);
    try {
      await deleteDoc(doc(db, 'savedMenus', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `savedMenus/${id}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const seedMenu = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const initialMenu = [
        { name: 'עוף פרובנסל', description: 'קרעיים עוף מושחמים, לימון, תפוחי אדמה, יין לבן, זיתים רוזמרין וטימין טרי', price: 65, unit: '0.5 ק"ג', imageUrl: 'https://images.unsplash.com/photo-1598514982205-f36b96d1e8d4?auto=format&fit=crop&q=80&w=800', inStock: true },
        { name: 'כדורי בשר מלנזה', description: "כדורי בשר בקר וגבינת פרמז'ן ברוטב עגבניות חרוכות", price: 81, unit: '0.5 ק"ג', imageUrl: 'https://images.unsplash.com/photo-1529042410759-befb1204b468?auto=format&fit=crop&q=80&w=800', inStock: true },
        { name: 'כדורי בשר ברוטב עגבניות', description: 'כדורי בשר בקר ברוטב עגבניות ביתי', price: 65, unit: '0.5 ק"ג', imageUrl: 'https://images.unsplash.com/photo-1529042410759-befb1204b468?auto=format&fit=crop&q=80&w=800', inStock: true },
        { name: 'ביף בורגיניון', description: 'צלי בקר בבישול ארוך וסבלני, ירקות שורש, יין אדום וציר', price: 85, unit: '0.5 ק"ג', imageUrl: 'https://images.unsplash.com/photo-1608897013039-887f21d8c804?auto=format&fit=crop&q=80&w=800', inStock: true },
        { name: 'אורז פילאף', description: 'אורז פילאף עשיר', price: 30, unit: '0.5 ק"ג', imageUrl: 'https://images.unsplash.com/photo-1539755530862-00f623c00f52?auto=format&fit=crop&q=80&w=800', inStock: true },
        { name: 'גרטין תפוחי אדמה', description: 'מאפה שכבות של פרוסות תפוחי אדמה אפויות בשמנת וטימין', price: 49, unit: '0.5 ק"ג', imageUrl: 'https://images.unsplash.com/photo-1628198758804-0c5d6481105e?auto=format&fit=crop&q=80&w=800', inStock: true },
        { name: 'קרוק מדאם', description: 'המלך של הכריכים', price: 60, unit: 'יחידה', imageUrl: 'https://images.unsplash.com/photo-1528736235302-52922df5c122?auto=format&fit=crop&q=80&w=800', inStock: true },
        { name: 'בולונז', description: 'בשר בקר, עגבניות, קצת גזר ואורגנו טרי', price: 40, unit: '0.5 ק"ג', imageUrl: 'https://images.unsplash.com/photo-1622973536968-3ead9e780960?auto=format&fit=crop&q=80&w=800', inStock: true },
        { name: "פוקצ'יה מחמצת", description: '10 ס"מ פס', price: 12, unit: 'יחידה', imageUrl: 'https://images.unsplash.com/photo-1593442686862-f67341d33190?auto=format&fit=crop&q=80&w=800', inStock: true },
        { name: 'לחם מחמצת של קופנהגן', description: 'לחם מחמצת איכותי', price: 26, unit: 'יחידה', imageUrl: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&q=80&w=800', inStock: true },
        { name: 'שמרים קקאו', description: 'עוגת שמרים קקאו', price: 45, unit: 'יחידה', imageUrl: 'https://images.unsplash.com/photo-1603532648955-039310d9ed75?auto=format&fit=crop&q=80&w=800', inStock: true },
        { name: 'קרדמון באן', description: 'מאפה שמרים חמאה והל דני', price: 20, unit: 'יחידה', imageUrl: 'https://images.unsplash.com/photo-1509365465985-25d11c17e812?auto=format&fit=crop&q=80&w=800', inStock: true },
      ];

      for (const item of initialMenu) {
        await addDoc(collection(db, 'menu'), {
          ...item,
          createdAt: serverTimestamp()
        });
      }
      alert('התפריט נטען בהצלחה!');
    } catch (error: any) {
      console.error("Error seeding menu:", error);
      setError(`שגיאה בטעינת התפריט: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const saveMenuItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    
    // Client-side validation
    if (!newItem.name.trim()) { setError('נא להזין שם פריט'); return; }
    if (!newItem.description.trim()) { setError('נא להזין תיאור'); return; }
    if (newItem.price <= 0) { setError('המחיר חייב להיות גבוה מ-0'); return; }
    if (!newItem.unit.trim()) { setError('נא להזין יחידת מידה'); return; }

    setIsSubmitting(true);
    setError(null);
    
    try {
      // Compress image if it's a base64 string to avoid Firestore 1MB limit
      // Use a placeholder if no image is provided, as requested by the user
      let finalImageUrl = newItem.imageUrl.trim() || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&q=80&w=800';
      if (finalImageUrl.startsWith('data:image')) {
        try {
          finalImageUrl = await compressImage(finalImageUrl);
        } catch (e) {
          console.error("Compression failed", e);
        }
      }

      const dataToSave = {
        name: newItem.name.trim(),
        description: newItem.description.trim(),
        price: Number(newItem.price),
        unit: newItem.unit.trim(),
        imageUrl: finalImageUrl,
        inStock: true,
      };

      if (editingItemId) {
        await updateDoc(doc(db, 'menu', editingItemId), dataToSave);
      } else {
        await addDoc(collection(db, 'menu'), {
          ...dataToSave,
          createdAt: serverTimestamp()
        });
      }
      
      setIsAddingItem(false);
      setEditingItemId(null);
      setNewItem({ name: '', description: '', price: 0, unit: 'יחידה', imageUrl: '' });
    } catch (error: any) {
      console.error("Error saving menu item:", error);
      const errorMsg = error.message || 'וודא שיש לך הרשאות מתאימות';
      setError(`שגיאה בשמירת הפריט: ${errorMsg}`);
      // Log it for the system
      try { handleFirestoreError(error, editingItemId ? OperationType.UPDATE : OperationType.CREATE, 'menu'); } catch(e) {}
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!user && !isManualAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-brand-cream" dir="rtl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-10 rounded-[40px] shadow-xl w-full max-w-md border border-brand-red/10"
        >
          <div className="text-center mb-8">
            <h2 className="text-4xl font-display text-brand-red mb-2">כניסת מנהל</h2>
            <p className="text-brand-blue font-display text-lg">ניהול המטבח של איה</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-[10px] uppercase tracking-widest text-gray-400 mb-2 mr-4">אימייל</label>
              <input
                type="text"
                value={loginForm.email}
                onChange={e => setLoginForm({ ...loginForm, email: e.target.value })}
                className="w-full bg-brand-cream rounded-2xl py-4 px-6 outline-none focus:ring-2 ring-brand-red/20 text-center font-mono"
                placeholder="אימייל"
                disabled={isLoggingIn}
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-widest text-gray-400 mb-2 mr-4">סיסמה</label>
              <input
                type="password"
                value={loginForm.password}
                onChange={e => setLoginForm({ ...loginForm, password: e.target.value })}
                className="w-full bg-brand-cream rounded-2xl py-4 px-6 outline-none focus:ring-2 ring-brand-red/20 text-center font-mono"
                placeholder="••••••••"
                disabled={isLoggingIn}
              />
            </div>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="text-brand-red text-sm text-center bg-brand-red/5 py-2 rounded-xl"
              >
                {error}
              </motion.div>
            )}
            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full bg-brand-red text-white py-5 rounded-full font-medium text-lg shadow-lg shadow-brand-red/20 hover:bg-brand-red/90 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isLoggingIn ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  מתחבר...
                </>
              ) : 'כניסה למטבח'}
            </button>

            <button
              type="button"
              onClick={() => window.location.hash = ''}
              className="w-full bg-gray-100 text-gray-400 py-4 rounded-full font-medium hover:bg-gray-200 transition-colors"
            >
              חזרה לתפריט
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-brand-cream" dir="rtl">
      {/* Sidebar */}
      <aside className="w-full md:w-72 bg-white md:border-l border-b md:border-b-0 border-brand-red/10 flex flex-col p-6 md:p-8 md:h-screen md:sticky md:top-0 z-10">
        <div className="mb-6 md:mb-12">
          <h1 className="text-3xl md:text-4xl font-display text-brand-red leading-none">איה בר-און</h1>
          <p className="text-brand-blue font-display text-base md:text-lg tracking-widest mt-1">לוח בקרה למנהל</p>
        </div>

        <nav className="flex-1 flex flex-row md:flex-col gap-2 overflow-x-auto pb-2 md:pb-0">
          <button
            onClick={() => setActiveTab('orders')}
            className={cn(
              "flex-shrink-0 md:w-full flex items-center gap-3 md:gap-4 px-4 md:px-6 py-3 md:py-4 rounded-2xl transition-all",
              activeTab === 'orders' ? "bg-brand-red text-white shadow-lg shadow-brand-red/20" : "text-gray-400 hover:bg-brand-cream hover:text-brand-red"
            )}
          >
            <ClipboardList className="w-5 h-5" />
            <span className="font-medium whitespace-nowrap">הזמנות חיות</span>
            {orders.filter(o => o.status === 'pending').length > 0 && (
              <span className="mr-auto bg-brand-red text-white text-[10px] px-2 py-1 rounded-full animate-pulse">
                {orders.filter(o => o.status === 'pending').length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('menu')}
            className={cn(
              "flex-shrink-0 md:w-full flex items-center gap-3 md:gap-4 px-4 md:px-6 py-3 md:py-4 rounded-2xl transition-all",
              activeTab === 'menu' ? "bg-brand-red text-white shadow-lg shadow-brand-red/20" : "text-gray-400 hover:bg-brand-cream hover:text-brand-red"
            )}
          >
            <UtensilsCrossed className="w-5 h-5" />
            <span className="font-medium whitespace-nowrap">ניהול תפריט</span>
          </button>

          <div className="md:pt-8 md:mt-8 md:border-t border-brand-red/10 flex-shrink-0">
            <button
              onClick={() => window.location.hash = ''}
              className="w-full flex items-center gap-3 md:gap-4 px-4 md:px-6 py-3 md:py-4 text-gray-400 hover:text-brand-red transition-colors"
            >
              <LayoutDashboard className="w-5 h-5" />
              <span className="font-medium whitespace-nowrap">חזרה לתפריט</span>
            </button>
          </div>
        </nav>

        <button
          onClick={handleLogout}
          className="mt-4 md:mt-auto flex items-center gap-3 md:gap-4 px-4 md:px-6 py-3 md:py-4 text-gray-400 hover:text-brand-red transition-colors"
        >
          <LogOut className="w-5 h-5" />
          <span className="font-medium">התנתקות</span>
        </button>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-12 overflow-y-auto w-full">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 md:mb-12">
          <div>
            <h2 className="text-4xl md:text-5xl font-display text-brand-red">
              {activeTab === 'orders' ? 'הזמנות חיות' : 'ניהול תפריט'}
            </h2>
            <p className="text-brand-blue font-display text-lg md:text-xl mt-2">
              {activeTab === 'orders' ? `יש לך ${orders.length} הזמנות סה"כ היום` : `מנהל ${menu.length} פריטים בתפריט`}
            </p>
          </div>
          {activeTab === 'menu' && (
            <div className="flex flex-wrap gap-3 md:gap-4 w-full md:w-auto">
              <button
                onClick={() => setIsLoadMenuModalOpen(true)}
                disabled={isSubmitting}
                className="flex-1 md:flex-none bg-white text-brand-blue border border-brand-blue/20 px-4 md:px-6 py-3 md:py-4 rounded-full flex items-center justify-center gap-2 font-medium shadow-sm hover:bg-brand-blue/5 transition-all disabled:opacity-50 text-sm whitespace-nowrap"
                title="טען תפריט שמור"
              >
                <Download className="w-4 h-4" />
                טען תפריט
              </button>
              <button
                onClick={() => setIsSavingMenuModalOpen(true)}
                disabled={isSubmitting || menu.length === 0}
                className="flex-1 md:flex-none bg-white text-green-600 border border-green-600/20 px-4 md:px-6 py-3 md:py-4 rounded-full flex items-center justify-center gap-2 font-medium shadow-sm hover:bg-green-50 transition-all disabled:opacity-50 text-sm whitespace-nowrap"
                title="שמור תפריט נוכחי"
              >
                <Save className="w-4 h-4" />
                שמור תפריט
              </button>
              <button
                onClick={deleteAllMenuItems}
                disabled={isSubmitting || menu.length === 0}
                className="flex-1 md:flex-none bg-white text-brand-red border border-brand-red/20 px-4 md:px-6 py-3 md:py-4 rounded-full flex items-center justify-center gap-2 font-medium shadow-sm hover:bg-brand-red/5 transition-all disabled:opacity-50 text-sm whitespace-nowrap"
                title="מחק את כל המנות"
              >
                <Trash2 className="w-4 h-4" />
                נקה הכל
              </button>
              <div className="w-full md:w-px md:h-8 bg-gray-200 mx-2 hidden md:block"></div>
              <button
                onClick={seedMenu}
                disabled={isSubmitting}
                className="flex-1 md:flex-none bg-white text-gray-500 border border-gray-200 px-4 md:px-6 py-3 md:py-4 rounded-full flex items-center justify-center gap-2 font-medium shadow-sm hover:bg-gray-50 transition-all disabled:opacity-50 text-sm whitespace-nowrap"
                title="טען תפריט התחלתי לדוגמה"
              >
                <RefreshCw className={cn("w-4 h-4", isSubmitting && "animate-spin")} />
                תפריט לדוגמה
              </button>
              <button
                onClick={() => {
                  setEditingItemId(null);
                  setNewItem({ name: '', description: '', price: 0, unit: 'יחידה', imageUrl: '' });
                  setIsAddingItem(true);
                }}
                className="flex-1 md:flex-none bg-brand-red text-white px-4 md:px-8 py-3 md:py-4 rounded-full flex items-center justify-center gap-2 md:gap-3 font-medium shadow-lg shadow-brand-red/20 hover:bg-brand-red/90 transition-all text-sm md:text-base whitespace-nowrap"
              >
                <Plus className="w-4 h-4 md:w-5 md:h-5" />
                הוספת פריט
              </button>
            </div>
          )}
        </header>

        {activeTab === 'orders' ? (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
            {orders.map((order) => (
              <motion.div
                layout
                key={order.id}
                className={cn(
                  "bg-white rounded-[40px] p-8 border border-brand-red/10 shadow-sm",
                  order.status === 'pending' && "ring-2 ring-brand-red/20 bg-brand-red/5"
                )}
              >
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <span className="text-2xl font-mono font-bold">#{order.orderNumber}</span>
                      <span className={cn(
                        "text-[10px] uppercase tracking-widest px-3 py-1 rounded-full font-bold",
                        order.status === 'pending' ? "bg-red-100 text-red-500" :
                        order.status === 'confirmed' ? "bg-blue-100 text-blue-500" :
                        order.status === 'ready' ? "bg-green-100 text-green-500" :
                        order.status === 'delivered' ? "bg-gray-100 text-gray-500" :
                        "bg-gray-100 text-gray-500"
                      )}>
                        {order.status === 'pending' ? 'ממתין' :
                         order.status === 'confirmed' ? 'אושר' :
                         order.status === 'ready' ? 'מוכן' :
                         order.status === 'delivered' ? 'נמסר' :
                         order.status === 'cancelled' ? 'בוטל' : order.status}
                      </span>
                    </div>
                    <p className="text-gray-400 text-xs">{format(order.createdAt?.toDate() || new Date(), 'dd/MM, HH:mm')}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handlePrintOrder(order)} title="הדפסת הזמנה" className="p-3 bg-[#f5f2ed] rounded-2xl text-gray-400 hover:text-[#5A5A40]"><Printer className="w-5 h-5" /></button>
                    <button onClick={() => handleEmailOrder(order)} title="שליחה למייל" className="p-3 bg-[#f5f2ed] rounded-2xl text-gray-400 hover:text-[#5A5A40]"><Mail className="w-5 h-5" /></button>
                    <button 
                      onClick={() => {
                        const text = encodeURIComponent(`היי ${order.customerName}, ההזמנה שלך (#${order.orderNumber}) אצלנו!`);
                        window.open(`https://wa.me/972${order.customerPhone.replace(/^0/, '')}?text=${text}`, '_blank');
                      }} 
                      title="שליחת הודעת וואטסאפ ללקוח" 
                      className="p-3 bg-[#f5f2ed] rounded-2xl text-gray-400 hover:text-[#25D366]"
                    >
                      <MessageCircle className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <div className="bg-[#f5f2ed] p-6 rounded-3xl mb-6">
                  <h4 className="font-serif italic text-lg mb-1">{order.customerName}</h4>
                  <p className="text-sm text-gray-500">{order.customerPhone} • {order.customerCity}</p>
                </div>

                <div className="space-y-4 mb-8">
                  {order.items.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <span className="w-8 h-8 bg-[#5A5A40]/10 text-[#5A5A40] rounded-lg flex items-center justify-center font-mono font-bold text-sm">
                          {item.quantity}
                        </span>
                        <span className="font-medium">{item.name}</span>
                      </div>
                      <span className="text-gray-400 font-mono text-sm">₪{item.price * item.quantity}</span>
                    </div>
                  ))}
                  <div className="pt-4 border-t border-dashed border-gray-200 flex justify-between items-center">
                    <span className="font-serif italic text-xl">סה"כ</span>
                    <span className="text-2xl font-mono font-bold">₪{order.total}</span>
                  </div>
                </div>

                  <div className="flex gap-3">
                    {order.status === 'pending' && (
                      <button
                        disabled={isSubmitting}
                        onClick={() => updateOrderStatus(order.id, 'confirmed')}
                        className="flex-1 bg-blue-500 text-white py-4 rounded-2xl font-medium flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Check className="w-5 h-5" /> אישור</>}
                      </button>
                    )}
                    {order.status === 'confirmed' && (
                      <button
                        disabled={isSubmitting}
                        onClick={() => updateOrderStatus(order.id, 'ready')}
                        className="flex-1 bg-green-500 text-white py-4 rounded-2xl font-medium flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Package className="w-5 h-5" /> לסמן כהושלם</>}
                      </button>
                    )}
                    {order.status === 'ready' && (
                      <button
                        disabled={isSubmitting}
                        onClick={() => updateOrderStatus(order.id, 'delivered')}
                        className="flex-1 bg-brand-red text-white py-4 rounded-2xl font-medium flex items-center justify-center gap-2 shadow-lg shadow-brand-red/20 disabled:opacity-50"
                      >
                        {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Check className="w-5 h-5" /> נמסר</>}
                      </button>
                    )}
                    <button
                      disabled={isSubmitting}
                      onClick={() => updateOrderStatus(order.id, 'cancelled')}
                      className="px-6 bg-gray-100 text-gray-400 py-4 rounded-2xl font-medium hover:bg-brand-red/5 hover:text-brand-red transition-colors disabled:opacity-50"
                    >
                      ביטול
                    </button>
                  </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {menu.map((item) => (
              <div key={item.id} className="bg-white rounded-[40px] overflow-hidden border border-brand-red/10 shadow-sm group">
                <div className="relative h-64">
                  <MediaRenderer src={item.imageUrl} className="w-full h-full object-cover" />
                  <div className="absolute top-4 right-4">
                    <button
                      disabled={isSubmitting}
                      onClick={() => toggleStock(item.id, !item.inStock)}
                      className={cn(
                        "px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest backdrop-blur-md border disabled:opacity-50 flex items-center gap-2",
                        item.inStock ? "bg-green-500/20 text-green-500 border-green-500/30" : "bg-brand-red/20 text-brand-red border-brand-red/30"
                      )}
                    >
                      {isSubmitting ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                      {item.inStock ? 'במלאי' : 'אזל מהמלאי'}
                    </button>
                  </div>
                </div>
                <div className="p-8">
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="text-3xl font-display text-brand-red">{item.name}</h4>
                    <span className="font-display font-bold text-2xl text-brand-blue">₪{item.price}</span>
                  </div>
                  <p className="text-brand-blue font-display text-lg mb-6 line-clamp-2">{item.description}</p>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] uppercase tracking-widest text-gray-300">לפי {item.unit}</span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => {
                          setEditingItemId(item.id);
                          setNewItem({
                            name: item.name,
                            description: item.description,
                            price: item.price,
                            unit: item.unit,
                            imageUrl: item.imageUrl
                          });
                          setIsAddingItem(true);
                        }}
                        className="p-3 text-gray-300 hover:text-brand-blue transition-colors"
                        title="עריכת מנה"
                      >
                        <Edit2 className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(item.id)}
                        className="p-3 text-gray-300 hover:text-brand-red transition-colors"
                        title="מחיקת מנה"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Add Item Modal */}
      <AnimatePresence>
        {isAddingItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddingItem(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative bg-white w-full max-w-2xl rounded-[40px] p-12 border border-brand-red/10"
            >
              <h3 className="text-3xl md:text-4xl font-display text-brand-red mb-8 text-right">
                {editingItemId ? 'עריכת מנה' : 'הוספת פריט חדש לתפריט'}
              </h3>
              <form onSubmit={saveMenuItem} className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 text-right">
                <div className="space-y-6">
                  <div>
                    <label className="block text-[10px] uppercase tracking-widest text-gray-400 mb-2 mr-4">שם הפריט</label>
                    <input
                      required
                      type="text"
                      value={newItem.name}
                      onChange={e => setNewItem({ ...newItem, name: e.target.value })}
                      className="w-full bg-brand-cream rounded-2xl py-4 px-6 outline-none focus:ring-2 ring-brand-red/20"
                      placeholder="לחם מחמצת"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase tracking-widest text-gray-400 mb-2 mr-4">מחיר (₪)</label>
                    <input
                      required
                      type="number"
                      value={newItem.price}
                      onChange={e => setNewItem({ ...newItem, price: Number(e.target.value) })}
                      className="w-full bg-brand-cream rounded-2xl py-4 px-6 outline-none focus:ring-2 ring-brand-red/20"
                      placeholder="35"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase tracking-widest text-gray-400 mb-2 mr-4">יחידת מידה</label>
                    <div className="relative">
                      <input
                        required
                        type="text"
                        list="unit-suggestions"
                        value={newItem.unit}
                        onChange={e => setNewItem({ ...newItem, unit: e.target.value })}
                        className="w-full bg-brand-cream rounded-2xl py-4 px-6 outline-none focus:ring-2 ring-brand-red/20"
                        placeholder="יחידה / 100 גרם / 10 ס״מ"
                      />
                      <datalist id="unit-suggestions">
                        <option value="יחידה" />
                        <option value="100 גרם" />
                        <option value="500 גרם" />
                        <option value="1 ק״ג" />
                        <option value="10 ס״מ" />
                      </datalist>
                    </div>
                  </div>
                </div>
                <div className="space-y-6">
                  <div>
                    <label className="block text-[10px] uppercase tracking-widest text-gray-400 mb-2 mr-4">תמונה למנה</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newItem.imageUrl}
                        onChange={e => setNewItem({ ...newItem, imageUrl: e.target.value })}
                        className="flex-1 bg-brand-cream rounded-2xl py-4 px-6 outline-none focus:ring-2 ring-brand-red/20 text-sm"
                        placeholder="כתובת תמונה או סרטון (URL) - אופציונלי"
                      />
                      <label className="cursor-pointer px-4 bg-gray-200 text-gray-700 rounded-2xl hover:bg-gray-300 transition-all flex items-center justify-center" title="העלאת קובץ (תמונה או סרטון)">
                        {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                        <input 
                          type="file" 
                          accept="image/*,video/*" 
                          className="hidden" 
                          onChange={handleFileUpload}
                          disabled={isUploading}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={generateAIImage}
                        disabled={isGeneratingImage || isUploading}
                        className="px-4 bg-brand-blue text-white rounded-2xl hover:bg-brand-blue/90 transition-all disabled:opacity-50 flex items-center justify-center"
                        title="ייצור תמונה ב-AI"
                      >
                        {isGeneratingImage ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                      </button>
                    </div>
                    {newItem.imageUrl && newItem.imageUrl.startsWith('data:') && (
                      <p className="text-[10px] text-green-500 mt-1 mr-4">תמונת AI נוצרה בהצלחה</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase tracking-widest text-gray-400 mb-2 mr-4">תיאור</label>
                    <textarea
                      required
                      value={newItem.description}
                      onChange={e => setNewItem({ ...newItem, description: e.target.value })}
                      className="w-full bg-brand-cream rounded-2xl py-4 px-6 outline-none focus:ring-2 ring-brand-red/20 h-32 resize-none"
                      placeholder="לחם מחמצת בעבודת יד עם..."
                    />
                  </div>
                </div>
                <div className="col-span-2 flex flex-col gap-4 mt-4">
                  {error && <p className="text-brand-red text-sm text-center bg-brand-red/5 py-2 rounded-xl">{error}</p>}
                  <div className="flex gap-4">
                    <button 
                      type="submit" 
                      disabled={isSubmitting}
                      className="flex-1 bg-brand-red text-white py-5 rounded-full font-medium text-lg shadow-lg shadow-brand-red/20 hover:bg-brand-red/90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          מעבד...
                        </>
                      ) : (editingItemId ? 'עדכון פריט' : 'יצירת פריט')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsAddingItem(false)}
                      className="px-12 bg-gray-100 text-gray-400 py-5 rounded-full font-medium hover:bg-gray-200 transition-colors"
                    >
                      ביטול
                    </button>
                  </div>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirmId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDeleteConfirmId(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative bg-white w-full max-w-md rounded-[40px] p-12 border border-brand-red/10 text-center"
            >
              <div className="w-20 h-20 bg-brand-red/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <Trash2 className="w-10 h-10 text-brand-red" />
              </div>
              <h3 className="text-3xl font-display text-brand-red mb-4">מחיקת פריט</h3>
              <p className="text-brand-blue font-display text-lg mb-8">האם אתם בטוחים שברצונכם למחוק פריט זה? פעולה זו אינה ניתנת לביטול.</p>
              <div className="flex gap-4">
                <button
                  disabled={isSubmitting}
                  onClick={() => deleteMenuItem(deleteConfirmId)}
                  className="flex-1 bg-brand-red text-white py-4 rounded-full font-medium hover:bg-brand-red/90 transition-all shadow-lg shadow-brand-red/20 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      מוחק...
                    </>
                  ) : 'מחיקה'}
                </button>
                <button
                  disabled={isSubmitting}
                  onClick={() => setDeleteConfirmId(null)}
                  className="flex-1 bg-gray-100 text-gray-400 py-4 rounded-full font-medium hover:bg-gray-200 transition-colors disabled:opacity-50"
                >
                  ביטול
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Save Menu Modal */}
      <AnimatePresence>
        {isSavingMenuModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSavingMenuModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative bg-white w-full max-w-md rounded-[40px] p-8 border border-brand-red/10"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-3xl font-display text-brand-red">שמירת תפריט נוכחי</h3>
                <button onClick={() => setIsSavingMenuModalOpen(false)} className="p-2 bg-gray-100 rounded-full text-gray-400 hover:text-brand-red transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={saveCurrentMenu} className="space-y-6">
                <div>
                  <label className="block text-[10px] uppercase tracking-widest text-gray-400 mb-2 mr-4">שם התפריט</label>
                  <input
                    type="text"
                    required
                    value={menuName}
                    onChange={e => setMenuName(e.target.value)}
                    className="w-full bg-brand-cream rounded-2xl py-4 px-6 outline-none focus:ring-2 ring-brand-red/20"
                    placeholder="לדוגמה: תפריט שבועי 1.1.2024"
                  />
                </div>
                {error && <p className="text-brand-red text-sm text-center bg-brand-red/5 py-2 rounded-xl">{error}</p>}
                <div className="flex gap-4">
                  <button 
                    type="submit" 
                    disabled={isSubmitting || !menuName.trim()}
                    className="flex-1 bg-green-600 text-white py-4 rounded-full font-medium shadow-lg shadow-green-600/20 hover:bg-green-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                    שמור תפריט
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Load Menu Modal */}
      <AnimatePresence>
        {isLoadMenuModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsLoadMenuModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative bg-white w-full max-w-2xl rounded-[40px] p-8 border border-brand-red/10 max-h-[80vh] flex flex-col"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-3xl font-display text-brand-red">טעינת תפריט שמור</h3>
                <button onClick={() => setIsLoadMenuModalOpen(false)} className="p-2 bg-gray-100 rounded-full text-gray-400 hover:text-brand-red transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto pr-2 space-y-4">
                {savedMenus.length === 0 ? (
                  <div className="text-center py-12 text-gray-400">
                    <ClipboardList className="w-12 h-12 mx-auto mb-4 opacity-20" />
                    <p>אין תפריטים שמורים עדיין</p>
                  </div>
                ) : (
                  savedMenus.map((savedMenu) => (
                    <div key={savedMenu.id} className="bg-brand-cream/30 border border-brand-red/10 rounded-2xl p-4 flex items-center justify-between">
                      <div>
                        <h4 className="font-medium text-brand-blue text-lg">{savedMenu.name}</h4>
                        <p className="text-sm text-gray-500">{savedMenu.items?.length || 0} מנות • נשמר ב: {savedMenu.createdAt ? format(savedMenu.createdAt.toDate(), 'dd/MM/yyyy HH:mm') : ''}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => loadSavedMenu(savedMenu)}
                          disabled={isSubmitting}
                          className="px-4 py-2 bg-brand-blue text-white rounded-xl text-sm font-medium hover:bg-brand-blue/90 transition-colors disabled:opacity-50 flex items-center gap-2"
                        >
                          <Download className="w-4 h-4" />
                          טען תפריט
                        </button>
                        <button
                          onClick={() => deleteSavedMenu(savedMenu.id)}
                          disabled={isSubmitting}
                          className="p-2 text-gray-400 hover:text-brand-red hover:bg-brand-red/10 rounded-xl transition-colors disabled:opacity-50"
                          title="מחק תפריט שמור"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
