# Quick Start Guide

## ✅ Database sozlangan!

Barcha jadvallar muvaffaqiyatli yaratildi:
- Region, District, Mahallah
- AdminConfirmation
- Channel (mahallah registration uchun)
- Activity (view tracking bilan)
- PostView

## 🚀 Keyingi qadamlar

### 1. Ma'lumotlarni import qilish

Excel fayldagi mahallalar ma'lumotlarini import qiling:

```bash
# XLSX kutubxonasini o'rnatish
npm install xlsx

# SQL generatsiya qilish
npx ts-node scripts/generateSQL.ts

# Natija: scripts/mahallah_data.sql
```

Keyin yaratilgan SQL faylni MySQL tool'da run qiling yoki:

```bash
docker exec -i mock-ielts-db-1 mysql -u app --password=app adliya < scripts/mahallah_data.sql
```

### 2. Botni ishga tushirish

```bash
# Development mode
npm run dev
```

### 3. Botni guruhga qo'shish va test qilish

1. Botni Telegram guruhga qo'shing
2. Administrator qiling
3. Bot avtomatik ravishda mahalla ro'yxatdan o'tkazish jarayonini boshlaydi:
   - Viloyat tanlash
   - Tuman tanlash
   - Mahalla tanlash
   - Tasdiqlash

### 4. Admin panel

Bot ishga tushgandan keyin:

```
/admin - Admin panel
/stats - Statistika
/mahallahs - Mahallalar holati
/report - Excel hisobot
```

## 🐛 Muammolarni hal qilish

### Prisma connection error

Agar Prisma ulanishda muammo bo'lsa:

1. `.env` faylda to'g'ri ma'lumotlar borligini tekshiring:
   ```
   DATABASE_URL="mysql://app:app@127.0.0.1:3306/adliya"
   ```

2. Docker MySQL ishlab turganligini tekshiring:
   ```bash
   docker ps | grep mysql
   ```

3. Database'ga qo'lda ulanishni tekshiring:
   ```bash
   docker exec -it mock-ielts-db-1 mysql -u app --password=app adliya
   ```

### TypeScript errors

TypeScript xatolari bo'lsa:

```bash
# Prisma Client'ni qaytadan generate qiling
npx prisma generate

# VSCode TS Server'ni restart qiling
# Cmd+Shift+P -> "TypeScript: Restart TS Server"
```

## 📝 Database ma'lumotlar

**Connection:** Docker MySQL container `mock-ielts-db-1`

**Credentials:**
- Host: `127.0.0.1` (localhost)
- Port: `3306`
- Database: `adliya`
- User: `app`
- Password: `app`

**Direct access:**
```bash
docker exec -it mock-ielts-db-1 mysql -u app --password=app adliya
```

## 📊 Ma'lumotlar import qilish

### Variant 1: TypeScript script (tavsiya etiladi)

```bash
npm install xlsx
npx ts-node scripts/generateSQL.ts
docker exec -i mock-ielts-db-1 mysql -u app --password=app adliya < scripts/mahallah_data.sql
npm uninstall xlsx  # optional
```

### Variant 2: MySQL tool orqali

1. `scripts/generateSQL.ts` ni run qiling
2. Yaratilgan `mahallah_data.sql` ni MySQL tool'da ochib run qiling

### Variant 3: Namuna ma'lumotlar

Agar faqat test qilmoqchi bo'lsangiz:

```bash
docker exec -i mock-ielts-db-1 mysql -u app --password=app adliya < scripts/seed.sql
```

Bu Toshkent, Samarqand, Farg'ona va boshqa viloyatlarning namuna ma'lumotlarini import qiladi.

## 🎯 Features

1. **Avtomatik mahalla ro'yxatdan o'tkazish**
   - Interactive keyboard (Viloyat → Tuman → Mahalla)
   - Admin tasdiqlamalari
   - 2-3 admin bir mahallani tasdiqlashi mumkin

2. **Excel hisobotlar**
   - Ulangan/ulanmagan mahallalar ro'yxati
   - Viloyat/tuman kesimida
   - Export to Excel

3. **Kontent statistikasi**
   - Qancha post yuborilgan
   - Har bir post necha marta o'qilgan
   - Kanal bo'yicha statistika

4. **Admin panel**
   - Umumiy statistika
   - Mahallalar holati
   - Kontent analytics

## ✨ Tayyor!

Barcha tizim tayyor. Faqat mahallalar ma'lumotlarini import qilish va botni ishga tushirish qoldi!

```bash
# 1. Ma'lumotlar import
npm install xlsx
npx ts-node scripts/generateSQL.ts
docker exec -i mock-ielts-db-1 mysql -u app --password=app adliya < scripts/mahallah_data.sql

# 2. Bot ishga tushirish
npm run dev

# 3. Telegram'da test qilish
# Botni guruhga qo'shing va admin qiling
```

Omad! 🚀
