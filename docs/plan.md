# Tozzecard — Plan

> Tim: **Tozzecard** (Axel, Kiel, Fajar). Hackathon: BNB Chain × Binance Web3 Wallet — Tokenized Stocks (Main Track).
> Submission lock: **Minggu 11 Okt 2026, 12:00 UTC (19:00 WIB)**.
> Semua klaim teknis di plan ini bersumber dari [`research.md`](research.md). Yang belum terbukti ditandai *live check* (L1–L8).

---

## 1. Konsep dalam satu kalimat

**Portofolio saham tokenized-mu dikelola agent, belanjamu dari kartu, dan kartumu tidak pernah menjual sahammu di harga weekend.**

Turunan dari Comacard ("jangan jual asetmu di waktu yang salah"), tapi tanpa kredit dan tanpa custody.

### Masalah
1. **Crypto card hari ini kustodial.** Saldo user dipindah ke platform, yang dipakai belanja adalah likuiditas platform — UI cuma menampilkan saldo terpotong.
2. **Saham tokenized diperdagangkan 24/7, bursa aslinya tidak.** Jumat 16:00 NY `referencePrice` membeku sampai Senin; harga on-chain bisa melenceng. Orang yang jual saham untuk belanja di weekend jual di harga jelek.
3. Belum ada produk yang menghubungkan "saya pegang saham" dengan "saya mau belanja" tanpa custody.

### Solusi
- **Agent wallet** = Binance Agentic Wallet **milik user sendiri** (MPC, di Binance App user). Memegang saham: beli, rebalance, **refill prediktif** ke kartu.
- **Card** = wallet milik user (key dikunci passkey, tanpa seed phrase) yang menampung **USD1** untuk belanja. Bayar lewat **B402**, gas ditanggung Binance — kartu tidak perlu BNB.
- Agent membaca pola belanja user (mis. "weekend biasanya ±80 USD1") dan **mengisi kartu saat bursa buka**, sebelum kebutuhan datang. Yang dijual = saham yang overweight, jadi refill sekaligus rebalance.

### Prinsip (tidak boleh dilanggar)
| Prinsip | Artinya |
|---|---|
| Non-custodial | Kami tidak pernah memegang dana atau key user. Tidak ada vault, tidak ada pool. |
| Hanya kontrak resmi | Semua kontrak milik Binance, BNB Chain, atau issuer token. **Tidak ada kontrak custom**, tidak bergantung pada smart account / delegate pihak ketiga. |
| Agent hanya bisa mengisi | Agentic Wallet hanya bisa kirim ke alamat di address book, dan address book hanya bisa diubah user di Binance App. User mendaftarkan **hanya alamat kartunya**. Dijamin Binance, bukan oleh kode kami. |
| Tidak ada kredit | Tidak ada pinjaman, skor, atau likuidasi. |
| Tidak jual di harga jelek | Jual saat bursa buka; saat tutup hanya jika spread kecil. |
| Setiap keputusan agent bisa dijelaskan | Feed "kenapa agent jual AMZN Jumat 15:40" dengan angka nyata. |
| Semua live | BSC mainnet, nominal kecil. Dry-run sebelum eksekusi bila jalurnya mendukung. |

---

## 2. Arsitektur

```
                 ┌──────────────────────── Binance Web3 API ─────────────────────────┐
                 │ RWA Data · Market · Wallet (read) · Trading · Transaction · B402  │
                 └──────────▲────────────────────────────────────────▲──────────────┘
                            │ data                                    │ verify/settle
┌──────────────┐  perintah ┌┴──────────────────┐  baw CLI  ┌──────────┴────────────────┐
│ Frontend     │ ────────▶ │ Backend (otak)    │ ────────▶ │ Agent wallet              │
│ (Axel)       │ ◀──────── │ (Kiel)            │           │ Binance Agentic Wallet    │
│ onboarding   │ feed/saldo│ forecaster        │           │ milik user (MPC, App)     │
│ kartu, bayar │           │ market-hours      │           │ address book = kartu saja │
│ portofolio   │           │ scheduler, log    │           │ (Fajar)                   │
└──────┬───────┘           │ merchant demo B402│           └────────────┬──────────────┘
       │                   └───────────────────┘                        │ USD1 (baw wallet send)
       │ tanda tangan EIP-3009 (passkey buka key)                        ▼
       ▼                                                  ┌──────────────────────────────┐
┌──────────────┐   B402 settle, gas ditanggung Binance    │ Card wallet (milik user)     │
│ Merchant     │ ◀─────────────────────────────────────── │ EOA, key dienkripsi passkey  │
│ (server B402)│                                          │ PRF, saldo USD1, 0 BNB       │
└──────────────┘                                          └──────────────────────────────┘
```

### Komponen
| # | Komponen | Owner | Isi |
|---|---|---|---|
| 1 | Agent & on-chain | **Fajar** | Wrapper `baw` CLI (sign-in, swap, send, saldo), handling sesi habis, jalur swap Ondo (RFQ) & bStock, verifikasi address book |
| 2 | Backend & otak | **Kiel** | Client Binance Web3 API (HMAC), market-hours & spread reader, forecaster, scheduler refill/rebalance, log keputusan, **server merchant demo B402** |
| 3 | Frontend & card | **Axel** | Onboarding, card wallet (key + passkey PRF), signing EIP-3009, alur bayar B402, portofolio, feed keputusan agent |
| 4 | Submission | Semua (Kiel: DX report, Axel: video) | DX report, demo video, README, deploy |

---

## 3. Alur utama

### 3.1 Onboarding (target < 3 menit, tanpa seed phrase)
1. User buka app → **buat kartu dengan passkey**: app membuat key EOA, mengenkripsinya dengan kunci dari WebAuthn PRF, simpan terenkripsi. Alamat kartu jadi.
2. **Sambungkan agent:** user login Agentic Wallet (QR → konfirmasi di Binance App).
3. **Kunci agent ke kartu:** di Binance App user menambah **alamat kartu** ke address book, set daily limit dan token allowlist. App menampilkan panduan langkah demi langkah.
4. User pilih strategi ("70% Mag 7, 30% AI Chips") atau basket (`tabId` RWA Data API) + estimasi belanja mingguan (cold start forecaster).
5. Agent membeli basket dari saldo stablecoin di Agentic Wallet.

### 3.2 Belanja (B402)
1. User scan QR / buka link merchant → server merchant membalas `402 Payment Required` + syarat bayar (USD1, jumlah, `payTo`).
2. App menampilkan jumlah; user konfirmasi dengan passkey → key terbuka → tanda tangan EIP-3009 `transferWithAuthorization`.
3. Server merchant memanggil B402 verify → settle. B402 mengirim tx, gas ditanggung Binance, USD1 langsung ke `payTo` merchant.
4. Backend mencatat pembayaran (tx hash + order ref) → data forecaster.

### 3.3 Refill prediktif (inti produk)
Dijalankan scheduler backend, dieksekusi lewat `baw`.

```
kebutuhan = forecast belanja dari sekarang sampai bursa buka berikutnya setelah close berikutnya
target    = kebutuhan × 1.2 (buffer)
kurang    = target − saldo kartu

JIKA sesi baw habis → notifikasi user untuk login ulang, stop.
JIKA marketStatus = regular DAN kurang > 0 DAN (≤ 30 menit sebelum nextCloseTime ATAU saldo < floor):
    pilih saham untuk dijual (3.4) → baw market-order swap → USD1 → baw wallet send ke kartu
JIKA bursa tutup DAN saldo < floor (darurat):
    JIKA spread terkecil < 1%  → refill seminimal mungkin dari saham itu
    SELAIN ITU                  → tahan, notifikasi user ("diskon weekend 3.2%, tunggu Senin?")
```

- **Forecaster v1:** rata-rata belanja per bucket (hari kerja vs weekend) dari N minggu terakhir, fallback ke estimasi onboarding. Tanpa ML.
- **Spread (hasil G6, research.md §5):** `referencePrice` dari API diturunkan dari harga on-chain, jadi tidak bisa jadi acuan independen. Backend menyimpan acuannya sendiri: harga per saham (`rwa/price` `referencePrice`) saat sesi regular terakhir tutup. `spread = (quote_per_token − close_ref × ratio) / (close_ref × ratio)`, dengan `quote_per_token` dari Trading API (harga yang benar-benar bisa dieksekusi). Jangan pakai `rwa/tokens.tokenPrice` atau `underlying-market.referencePrice` (salah untuk token dengan ratio ≠ 1).
- Jika swap langsung ke USD1 tidak tersedia (L3): swap ke USDT lalu USDT → USD1.
- Daily limit Agentic Wallet membatasi total refill per hari — ini fitur keamanan, tampilkan di UI.
- Semua threshold = config, dikalibrasi di demo.

### 3.4 Pemilihan saham yang dijual
1. Yang paling overweight dibanding target alokasi (refill = rebalance).
2. Tie-break: spread terkecil, lalu price impact terkecil (quote Trading API).
3. Skip token dengan `marketStatus` pause / `ASSET_PAUSED` / `ASSET_LIMITED`.
4. Ondo: pakai market order (limit order bisa ditolak untuk Ondo).

### 3.5 Rebalance
Harian saat bursa buka: jika drift > 5% dari target → jual overweight, beli underweight.

### 3.6 Feed keputusan agent
Setiap aksi disimpan: waktu, aksi, token, jumlah, alasan (forecast, spread, status bursa), tx hash BscTrace. Tampil di app dalam bahasa manusia.

---

## 4. Pemakaian API & kontrak

### Modul
| Modul | Dipakai untuk |
|---|---|
| RWA Data | Daftar token, basket (`tabId`), `statusInfo` (marketStatus, nextOpenTime, nextCloseTime), `tokenPrice` vs `referencePrice`, profile & attestation report di UI |
| Market | Harga real-time & candle untuk grafik |
| Wallet (read) | Saldo & riwayat kartu dan agent wallet |
| Trading | Quote & price impact untuk pemilihan saham (3.4) |
| Transaction | Dry-run swap sebelum eksekusi bila memakai jalur Trading API langsung |
| **B402** | **Jalur pembayaran kartu**, gas ditanggung Binance |
| **Agentic Wallet (`baw`)** | Eksekusi: swap, send ke kartu, saldo. Target special prize $2k |

### Kontrak on-chain (semua resmi, tidak ada yang kami tulis)
| Kontrak | Pemilik |
|---|---|
| Agentic Wallet (MPC) | Binance |
| Router DEX (dari Trading API) | Binance |
| B402 facilitator (alamat dibaca dari `/api/v2/b402/supported`) | Binance |
| USD1 / U (EIP-3009) | Issuer |
| Token saham Ondo / bStocks | Issuer |

Tidak dipakai: ERC-4337 smart account, delegate EIP-7702, paymaster pihak ketiga, Altana/Turnkey, kontrak custom.

### Revenue — **terbuka, tergantung L4**
- Jika `baw` swap menerima fee/referrer → fee per refill/rebalance.
- Jika tidak → opsi: langganan Pro dibayar lewat B402 (kami sebagai merchant), atau fee merchant untuk rail pembayaran. Diputuskan setelah L4, tidak menghalangi MVP.

---

## 5. Live checks (28–30 Sep)

Detail dan sumber di [`research.md`](research.md#live-checks-must-pass-before-the-design-is-final).

| # | Cek | Owner | Jika gagal |
|---|---|---|---|
| L1 | `baw` sign-in + swap Ondo/bStock → stablecoin di BSC mainnet | Fajar | ✅ 28 Sep. Beli USDT→NVDAon & jual NVDAon→USDT live, selesai ±6 dtk (tx `0x693f6e5a…`, `0x5f482834…`). Min order $5 |
| L2 | `baw wallet send` ke alamat di luar address book ditolak | Fajar | ✅ 28 Sep, ditolak `351703`. **Hanya berlaku selama Developer Mode mati**: `contract-call` membobol address book (tx `0xb315357f…`). Agent menolak jalan bila Developer Mode aktif (#5) |
| L3 | `baw` swap langsung ke USD1; likuiditas $5–50 | Fajar | ⚠️ 28 Sep. bStock → USD1 langsung bisa. **Ondo hanya ke USDT** (`103` "one side must be a supported stablecoin"), lalu USDT → USD1 (live, 5 → 5.0012). Likuiditas $5–50 cukup (#4) |
| L4 | `baw` swap menerima fee/referrer | Fajar | ❌ 28 Sep. `market-order swap --help` tidak punya fee/referrer → revenue via B402 (§4) |
| L5 | B402 end-to-end: key browser tanda tangan EIP-3009 USD1, settle, payer 0 BNB | Kiel + Axel | Fallback USDT + Permit2 (user butuh sedikit BNB sekali) |
| L6 | WebAuthn PRF di Chrome & Safari iOS | Axel | Key dienkripsi PIN sebagai fallback |
| L7 | Transfer Ondo nominal > 0 antar wallet non-KYC | Fajar | Fokus bStocks |
| L8 | Kelayakan dari Indonesia: akun Binance + trading bStock/Ondo | Semua | Pilih issuer yang tersedia |
| G5 | API key aktif, HMAC signing, call pertama (catat berapa lama) | Kiel | ✅ 28 Sep, 282 ms, lolos di percobaan pertama |
| G6 | Rumus spread + perilaku `referencePrice` saat weekend | Kiel | ✅ rumus terkunci (research.md §5); perilaku weekend diamati Sabtu 3 Okt |

---

## 6. Pembagian tugas

### Fajar — Agent & Web3
- [ ] L1, L2, L3, L4, L7
- [ ] Wrapper `baw` (`--json`): `signin/status`, `balances`, `swap(from, to, amount)`, `send(to, token, amount)`
- [ ] Deteksi sesi habis → error yang jelas untuk scheduler
- [ ] Jalur jual Ondo & bStock, catat perbedaannya (bahan DX report)
- [ ] Rekam bukti L2 (send ke alamat asing ditolak) untuk demo
- [ ] Transaksi live pertama sebelum 3 Okt

### Kiel — Backend & data (+ pemilik DX report)
- [x] G5 — client HMAC `packages/binance`
- [x] G6 — rumus spread (weekend diamati 3 Okt)
- [ ] L5 (sisi server)
- [ ] Client Binance Web3 API (HMAC, retry, error mapping)
- [x] Market-hours & spread service (RWA Data) — `apps/api/src/market.ts`, `GET /market/:symbol`
- [x] **Deploy API** — Railway Singapura, 28 Sep, merekam acuan penutupan sejak sesi regular 28 Sep
- [x] Forecaster v1 — `apps/api/src/forecast.ts`
- [ ] Scheduler refill (3.3) + rebalance (3.5), pemilihan saham (3.4)
- [x] Server merchant demo B402 (402 → verify → settle) — kode + tes; live menunggu izin B402 di portal
- [ ] DB: user, target alokasi, pembayaran, log keputusan
- [ ] API untuk frontend: portofolio, saldo kartu, feed, strategi
- [ ] Mode "time travel" untuk demo (Jumat 15:30 NY) — logika disimulasikan, tx tetap live
- [ ] Kompilasi DX report

### Axel — Frontend & UX (+ pemilik demo video)
- [ ] L5 (sisi browser), L6
- [ ] Card wallet: buat key, enkripsi dengan passkey PRF, buka untuk tanda tangan
- [ ] Tanda tangan EIP-3009 + alur bayar B402 (scan QR / link)
- [ ] Onboarding termasuk panduan address book di Binance App
- [ ] Portofolio: alokasi vs target, harga on-chain vs referensi, status bursa + countdown `nextOpenTime`
- [ ] Feed keputusan agent (bahasa manusia + link BscTrace)
- [ ] Halaman merchant demo (QR / link)
- [ ] Demo video ≤ 4 menit

### Semua orang
Catat setiap friksi di [`dx-notes.md`](dx-notes.md) saat itu juga: waktu, URL, bagian persis, error persis, berapa lama stuck. 25% nilai.

---

## 7. Timeline

| Tanggal | Fokus | Selesai jika |
|---|---|---|
| 28–30 Sep | Live checks L1–L8, G5–G6 | Semua terjawab, desain dikunci |
| 1–3 Okt | Inti tiap komponen | Swap + send live via `baw`; kartu bayar B402 dengan 0 BNB |
| 4–6 Okt | Refill prediktif + rebalance + UI utama | Refill otomatis end-to-end di mainnet |
| 7–8 Okt | Integrasi, error handling, polish | Alur lengkap tanpa intervensi (kecuali login ulang Binance App) |
| 9–10 Okt | Demo video, DX report, README, deploy | Artefak siap |
| 11 Okt | Buffer, submit sebelum 19:00 WIB | Form terkirim |

---

## 8. Demo (≤ 4 menit)

1. **Hook (20s):** "Jumat 4 sore New York. Bursa tutup. Saham tokenized-mu masih jalan — di harga diskon."
2. **Onboarding (40s):** passkey → kartu jadi → sambung Agentic Wallet → alamat kartu di address book → pilih "Mag 7".
3. **Belanja (30s):** scan QR merchant → Face ID → bayar lewat B402, kartu tanpa BNB.
4. **Inti (90s):** time travel ke Jumat 15:30 → agent: "weekend kamu biasanya 80 USD1, saldo 20 → jual 60 dari NVDA (overweight 4%) sebelum bursa tutup." Swap → send → saldo kartu naik. Tx di BscTrace.
5. **Kontras (30s):** tanpa agent, jual Sabtu = rugi X% (angka nyata dari spread).
6. **Keamanan (20s):** agent diminta kirim ke alamat lain → **Binance menolak** (address book).
7. **Penutup (10s):** non-custodial, hanya kontrak resmi, modul yang dipakai.

---

## 9. Submission checklist
- [ ] Repo publik
- [ ] Demo video ≤ 4 menit
- [ ] Link deploy + instruksi untuk juri
- [ ] DX report (form terpisah), termasuk bagian AI stack (Agentic Wallet)
- [ ] Tx live di BSC mainnet yang bisa dicek
- [ ] Registrasi hackathon (semua anggota) + API key

---

## 10. Risiko
| Risiko | Mitigasi |
|---|---|
| Sesi Agentic Wallet habis (butuh konfirmasi di Binance App) | Scheduler deteksi & notifikasi; tampilkan status sesi di UI; jelaskan di DX report |
| Satu instance `baw` per user — sulit diskalakan multi-user | Untuk hackathon satu user demo; catat sebagai requested capability (HTTP API/SDK) di DX report |
| USD1 tidak likuid / tidak bisa swap langsung | Dua langkah via USDT (L3) |
| Kelayakan yurisdiksi bStock/Ondo | L8 hari pertama |
| Key kartu hilang jika passkey/perangkat hilang | Diterima untuk MVP; ekspor key terenkripsi sebagai stretch |
| Demo butuh jam bursa tertentu | Mode time travel; tx tetap nyata |

## 11. Scope

**Masuk MVP:** kartu passkey, bayar B402 gasless, agent via `baw` (beli, jual, refill), refill prediktif sadar jam bursa, rebalance drift, feed keputusan, merchant demo.

**Stretch (hanya jika inti selesai 6 Okt):** strategi natural language penuh, BNB Agent Studio (ERC-8004), perbandingan bStocks vs Ondo untuk ticker sama, backup key kartu.

**Keluar scope:** kredit/pinjaman/skor, vault/pool, kontrak custom, smart account / EIP-7702 pihak ketiga, kartu Visa/fisik, pull payment, perps, multichain.

---

## 12. Peran smart contract (keputusan final, 28 Sep)

**Tidak ada kontrak yang kami tulis.** Setiap peran "kartu" dipenuhi kontrak/layanan resmi:

| Peran | Dipenuhi oleh | Bukti |
|---|---|---|
| Menyimpan saham | Agentic Wallet user (MPC Binance) | research.md §1 |
| Agent hanya kirim ke kartu | Address book Agentic Wallet, hanya bisa diubah di Binance App | research.md §1 (`send.md`, `wallet-setting.md`) |
| Menjual saham | Router DEX Trading API / `baw market-order swap` | research.md §1–2 |
| Kartu (wallet user) | EOA biasa, key dienkripsi passkey PRF di browser | research.md §3 (tanpa smart account) |
| Bayar + gasless | B402 + USD1 EIP-3009 | research.md §2 |
| Struk pembayaran | Tx settle B402 + order ref di server merchant | — |

Dibatalkan: `CardPayments` (digantikan B402), Safe + Zodiac Roles, vault custom, MegaFuel (tidak perlu karena B402 menanggung gas pembayaran; agent wallet bayar gas sendiri dalam BNB).

Kontrak custom hanya dipertimbangkan lagi jika **L2 atau L5 gagal**, dan harus dibahas tim dulu.
