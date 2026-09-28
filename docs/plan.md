# Tozzecard — Plan

> Working name. Hackathon: BNB Chain × Binance Web3 Wallet — Tokenized Stocks (Main Track).
> Submission lock: **Minggu 11 Okt 2026, 12:00 UTC (19:00 WIB)**. Hari ini: 28 Sep → ±13 hari.

---

## 1. Konsep dalam satu kalimat

**Portofolio saham tokenized-mu dikelola agent, belanjamu dari kartu, dan kartumu tidak pernah menjual sahammu di harga weekend.**

Turunan dari Comacard ("jangan jual asetmu di waktu yang salah"), tapi tanpa kredit dan tanpa custody.

### Masalah
1. **Crypto card hari ini kustodial.** Saldo user dipindah ke platform, yang dipakai belanja adalah likuiditas platform — UI cuma menampilkan saldo terpotong.
2. **Saham tokenized diperdagangkan 24/7, bursa aslinya tidak.** Jumat 16:00 NY `referencePrice` membeku sampai Senin; harga on-chain bisa melenceng. Orang yang jual saham untuk belanja di weekend jual di harga jelek.
3. Belum ada produk yang menghubungkan "saya pegang saham" dengan "saya mau belanja" tanpa custody.

### Solusi
- **Agent (Agentic Wallet)** memegang saham user: beli, rebalance, dan **refill prediktif** ke kartu.
- **Card** = wallet milik user sendiri (smart account passkey) yang menampung USDT untuk belanja.
- Agent membaca pola belanja user (mis. "weekend biasanya ±80 USDT") dan **mengisi kartu saat bursa buka**, sebelum kebutuhan datang. Yang dijual = saham yang overweight, jadi refill sekaligus rebalance.

### Prinsip (tidak boleh dilanggar)
| Prinsip | Artinya |
|---|---|
| Non-custodial | Platform tidak pernah memegang dana user. Tidak ada vault, tidak ada pool. |
| Agent hanya bisa mengisi | Agent boleh swap & kirim USDT **hanya ke alamat kartu user** (allowlist). Tidak bisa kirim ke tempat lain. |
| Tidak ada kredit | Tidak ada pinjaman, tidak ada skor, tidak ada likuidasi. Dihapus dari scope. |
| Tidak jual di harga jelek | Jual saat bursa buka; saat tutup hanya jika spread kecil. |
| Setiap keputusan agent bisa dijelaskan | Feed "kenapa agent jual AMZN Jumat 15:40" dengan angka nyata. |
| Semua live | BSC mainnet, nominal kecil. Dry-run lewat Transaction API sebelum setiap eksekusi. |

---

## 2. Arsitektur

```
                  ┌─────────────────────── Binance Web3 API ───────────────────────┐
                  │ RWA Data · Market · Trading · Transaction · Wallet · b402      │
                  └───────────────▲──────────────────────────▲─────────────────────┘
                                  │                          │
┌──────────────┐   perintah   ┌───┴──────────────┐  eksekusi ┌┴───────────────────┐
│ Frontend     │ ───────────▶ │ Backend (otak)   │ ────────▶ │ Agent wallet       │
│ (Axel)       │ ◀─────────── │ (Kiel)           │           │ Agentic Wallet     │
│ onboarding   │  feed/saldo  │ forecaster       │           │ (Fajar)            │
│ kartu, bayar │              │ market-hours     │           │ pegang saham       │
│ portofolio   │              │ scheduler, log   │           │ swap, refill       │
└──────┬───────┘              └──────────────────┘           └─────────┬──────────┘
       │ user tanda tangan (passkey)                                   │ USDT (allowlist)
       ▼                                                               ▼
┌──────────────┐          bayar USDT             ┌───────────────────────────────┐
│  Merchant    │ ◀────────────────────────────── │ Wallet kartu (milik user)     │
└──────────────┘                                 │ smart account passkey + gasless│
                                                 └───────────────────────────────┘
```

**Tidak ada smart contract buatan sendiri** di MVP. Kecuali hasil spike memaksa (lihat §5, gate G2).

### Komponen
| # | Komponen | Owner | Isi |
|---|---|---|---|
| 1 | Agent & on-chain | **Fajar** | Agentic Wallet / Skills, swap via Trading API, dry-run via Transaction API, allowlist/policy, fee integrator |
| 2 | Backend & otak | **Kiel** | Client API (auth/signing), market-hours & spread reader, forecaster belanja, scheduler refill/rebalance, log keputusan, DB |
| 3 | Frontend & card | **Axel** | Onboarding, smart account passkey + paymaster, kartu & bayar (QR/payment link), portofolio, feed keputusan agent |
| 4 | Submission | Semua (Kiel pemilik DX report, Axel pemilik video) | DX report, demo video, README, deploy |

---

## 3. Alur utama

### 3.1 Onboarding (target < 2 menit, tanpa seed phrase)
1. User buka app → buat kartu dengan passkey (Face ID / sidik jari) → smart account terbentuk.
2. User pilih strategi dalam bahasa biasa ("70% Mag 7, 30% AI Chips") atau pilih basket (`tabId` RWA Data API).
3. User isi estimasi belanja mingguan (cold start forecaster).
4. User deposit USDT ke agent wallet → agent beli basket.

### 3.2 Belanja
1. User scan QR / buka payment link merchant.
2. App tampilkan jumlah, user konfirmasi dengan passkey.
3. Transfer USDT kartu → merchant (gasless via paymaster).
4. Backend mencatat transaksi → masuk data forecaster.

### 3.3 Refill prediktif (inti produk)
Dijalankan scheduler backend, dieksekusi agent.

```
kebutuhan = forecast belanja dari sekarang sampai bursa buka berikutnya setelah close berikutnya
target    = kebutuhan × 1.2 (buffer)
kurang    = target − saldo kartu

JIKA marketStatus = regular DAN kurang > 0 DAN (≤ 30 menit sebelum nextCloseTime ATAU saldo < floor):
    pilih saham untuk dijual (lihat 3.4) → dry-run → swap ke USDT (fee integrator) → kirim ke kartu
JIKA bursa tutup DAN saldo < floor (darurat):
    JIKA spread terkecil < 1%  → refill seminimal mungkin dari saham itu
    SELAIN ITU                  → tahan, notifikasi user ("diskon weekend 3.2%, tunggu Senin?")
```

- **Forecaster v1 (cukup):** rata-rata belanja per bucket (hari kerja vs weekend) dari N minggu terakhir, fallback ke estimasi onboarding. Tidak perlu ML.
- `spread = |tokenPrice − referencePrice × tokenToShareRatio| / (referencePrice × tokenToShareRatio)`. Rumus rasio dicek saat spike.
- Semua threshold (buffer 1.2, floor, 30 menit, 1%) = config, dikalibrasi di demo.

### 3.4 Pemilihan saham yang dijual
1. Yang paling overweight dibanding target alokasi (refill = rebalance).
2. Tie-break: spread terkecil, lalu likuiditas terdalam (quote Trading API, price impact terkecil).
3. Skip token dengan `marketStatus` pause / `ASSET_PAUSED` / `ASSET_LIMITED`.

### 3.5 Rebalance
Harian saat bursa buka: jika drift > 5% dari target → jual overweight, beli underweight. Semua lewat dry-run dulu.

### 3.6 Feed keputusan agent
Setiap aksi disimpan: waktu, aksi, token, jumlah, alasan (forecast, spread, status bursa), tx hash BscTrace, hasil dry-run. Tampil di app dalam bahasa manusia.

---

## 4. Pemakaian API (untuk skor "technical depth")

| Modul | Dipakai untuk |
|---|---|
| RWA Data | Daftar token, basket (`tabId`), `statusInfo` (marketStatus, nextOpenTime, nextCloseTime), `tokenPrice` vs `referencePrice`, profile & attestation report (tampil di UI) |
| Market | Harga real-time & candle untuk grafik portofolio |
| Trading | Quote + swap (beli, rebalance, refill), `feePercent` + `toTokenReferrerWalletAddress` |
| Transaction | Simulasi setiap swap sebelum broadcast; broadcast |
| Wallet | Saldo & posisi agent wallet dan kartu, riwayat untuk forecaster |
| b402 | Stretch: bayar langganan Pro / pembayaran merchant |
| Agentic Wallet / Skills | Eksekusi on-chain oleh agent (target special prize $2k) |

### Revenue
- **Utama:** fee integrator per swap via `feePercent` (mis. 0.3%) → treasury. Non-custodial, satu parameter, terlihat di BscTrace saat demo.
- **Nanti:** langganan Pro via b402. Bukan untuk MVP.

---

## 5. Spike & decision gates (28–30 Sep)

Desain di atas bergantung pada hasil ini. **Spec dikunci setelah spike.**

| # | Pertanyaan | Owner | Jika YA | Jika TIDAK |
|---|---|---|---|---|
| G1 | Agentic Wallet bisa dipicu dari backend kita (bukan hanya chat)? | Fajar | Backend → agent via CLI/API | Agent jalan sebagai proses sendiri (Skills) yang dipanggil backend |
| G2 | Agentic Wallet punya policy/allowlist tujuan transfer? | Fajar | Pakai itu, tanpa kontrak | Safe + Zodiac Roles Module (konfigurasi, bukan Solidity). Terakhir: vault ±50 baris |
| G3 | Likuiditas bStocks/Ondo di BSC cukup untuk swap $5–50 dengan price impact wajar? | Fajar | Lanjut | Batasi ke token yang likuid saja, catat di DX report |
| G4 | Smart account passkey + paymaster (mis. MegaFuel) jalan di BSC mainnet untuk transfer USDT? | Axel | Gasless | User butuh sedikit BNB; onboarding kasih petunjuk |
| G5 | API key aktif, request signing jalan, call pertama sukses. Catat berapa lama. | Kiel | — | Blocker, eskalasi ke Telegram builder |
| G6 | Rumus `referencePrice` vs `tokenPrice` × `tokenToShareRatio` dan perilakunya saat weekend | Kiel | Formula spread final | — |
| G7 | xStocks ada di BSC / API? (RWA Data hanya list ondo & bstock) | Kiel | Tambah perbandingan | Fokus Ondo + bStocks, catat di DX report |

---

## 6. Pembagian tugas

### Fajar — Agent & Web3
- [ ] Spike G1, G2, G3
- [ ] Setup Agentic Wallet + install skills (`binance-agentic-wallet`, `binance-tokenized-securities-info`)
- [ ] Fungsi: `buy(basket, usdt)`, `sell(token, amount)`, `refill(amountUsdt)`, `rebalance(targets)`
- [ ] Setiap eksekusi: quote → dry-run (Transaction API) → swap → kembalikan tx hash + hasil
- [ ] Fee integrator ke treasury
- [ ] Allowlist: agent hanya bisa kirim ke alamat kartu
- [ ] Transaksi live pertama di mainnet (nominal kecil) sebelum 3 Okt

### Kiel — Backend & data (+ pemilik DX report)
- [ ] Spike G5, G6, G7
- [ ] Client Binance Web3 API (signing, retry, error mapping)
- [ ] Market-hours & spread service (RWA Data)
- [ ] Forecaster v1 (bucket hari kerja/weekend)
- [ ] Scheduler refill (§3.3) + rebalance (§3.5), pemilihan saham (§3.4)
- [ ] DB: user, target alokasi, transaksi kartu, log keputusan agent
- [ ] API untuk frontend: portofolio, saldo kartu, feed, strategi
- [ ] Mode "time travel" untuk demo: simulasikan Jumat 15:30 NY (bursa tidak menunggu jadwal video)
- [ ] Kompilasi DX report dari catatan tim

### Axel — Frontend & UX (+ pemilik demo video)
- [ ] Spike G4
- [ ] Onboarding passkey → kartu jadi (target < 2 menit)
- [ ] Visual kartu + saldo + riwayat
- [ ] Bayar: scan QR / payment link → konfirmasi passkey
- [ ] Halaman merchant sederhana (generate QR / link) untuk demo
- [ ] Portofolio: alokasi vs target, harga on-chain vs referensi, status bursa + countdown `nextOpenTime`
- [ ] Feed keputusan agent (bahasa manusia + link BscTrace)
- [ ] Input strategi natural language / pilih basket
- [ ] Demo video ≤ 4 menit

### Semua orang
- **Mulai hari ini** catat setiap friksi di dokumen bersama `dx-notes.md`: waktu, URL halaman docs, bagian persis, error message persis, berapa lama stuck. Report AI-generated/generik ditolak juri — catatan mentah = bahan terbaik (25% nilai).

---

## 7. Timeline

| Tanggal | Fokus | Selesai jika |
|---|---|---|
| 28–30 Sep | Spike G1–G7, setup repo | Semua gate terjawab, spec dikunci |
| 1–3 Okt | Inti tiap komponen | Swap live pertama di mainnet; kartu passkey bisa terima & kirim USDT |
| 4–6 Okt | Refill prediktif + rebalance + UI utama | Refill otomatis end-to-end di mainnet |
| 7–8 Okt | Integrasi, error handling, polish | Alur lengkap onboarding → beli → belanja → refill tanpa intervensi |
| 9–10 Okt | Demo video, DX report, README, deploy | Semua artefak submission siap |
| 11 Okt | Buffer, submit sebelum 19:00 WIB | Form terkirim |

---

## 8. Demo (≤ 4 menit)

1. **Hook (20s):** "Jumat 4 sore New York. Bursa tutup. Saham tokenized-mu masih jalan — di harga diskon."
2. **Onboarding (40s):** Face ID → kartu jadi → pilih "Mag 7" → agent beli.
3. **Belanja (30s):** scan QR merchant → bayar → saldo turun.
4. **Inti (90s):** time travel ke Jumat 15:30 → agent: "weekend kamu biasanya 80 USDT, saldo 20 → jual 60 USDT NVDA (overweight 4%) sekarang, sebelum bursa tutup." Dry-run → swap → USDT masuk kartu. Tunjukkan tx di BscTrace + fee ke treasury.
5. **Kontras (30s):** tanpa agent, jual Sabtu = rugi X% (angka nyata dari spread).
6. **Keamanan (20s):** agent coba kirim ke alamat lain → ditolak.
7. **Penutup (10s):** non-custodial, modul yang dipakai, link.

---

## 9. Submission checklist
- [ ] Repo publik
- [ ] Demo video ≤ 4 menit
- [ ] Link deploy + instruksi untuk juri
- [ ] DX report (form terpisah) — termasuk bagian AI stack (Agentic Wallet/Skills)
- [ ] Tx live di BSC mainnet yang bisa dicek
- [ ] Registrasi hackathon (semua anggota) + API key

---

## 10. Risiko
| Risiko | Mitigasi |
|---|---|
| Agentic Wallet tidak bisa dikontrol dari backend / tidak punya policy | Gate G1/G2 di hari 1–3; fallback Safe + Roles |
| Likuiditas tipis → slippage besar | Nominal kecil, batasi token, tampilkan price impact; bahan DX report |
| Demo butuh jam bursa tertentu | Mode time travel di backend untuk logika; tx live tetap nyata |
| Paymaster tidak mendukung | User pegang sedikit BNB, dijelaskan di onboarding |
| Waktu 13 hari | Scope dikunci di §11; stretch hanya kalau inti selesai 6 Okt |

## 11. Scope

**Masuk MVP:** onboarding passkey, beli basket, kartu + bayar push, refill prediktif sadar jam bursa, rebalance drift, feed keputusan, fee integrator, allowlist.

**Stretch (hanya jika inti selesai 6 Okt):** strategi natural language penuh, b402 (langganan / pembayaran merchant), BNB Agent Studio (identitas ERC-8004, target special prize), perbandingan bStocks vs Ondo untuk ticker yang sama.

**Keluar scope:** kredit/pinjaman/skor (dihapus), vault/pool, kartu Visa/fisik, pull payment, perps, multichain.
