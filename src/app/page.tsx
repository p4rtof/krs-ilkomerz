"use client";

import { useState, useMemo, useEffect } from "react";
import Image from "next/image";

type TipeKegiatan = "K" | "P" | "R";
type PilihanUser = Record<string, Record<TipeKegiatan, number>>;

const parseTime = (timeStr: string) => {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
};

const isOverlap = (s1: any, s2: any) => {
  if (!s1?.hari || !s2?.hari || !s1?.jam_mulai || !s2?.jam_selesai) return false;
  
  const hari1 = s1.hari.replace(/'/g, ""); // "Jum'at" jadi "Jumat"
  const hari2 = s2.hari.replace(/'/g, "");

  if (hari1 !== hari2) return false;
  return (
    parseTime(s1.jam_mulai) < parseTime(s2.jam_selesai) &&
    parseTime(s1.jam_selesai) > parseTime(s2.jam_mulai)
  );
};

export default function KrsSimulatorGacor() {
  const [semester, setSemester] = useState(4);
  const [pilihan, setPilihan] = useState<PilihanUser>({});
  const [dataJadwal, setDataJadwal] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // State baru untuk fitur "Preview Jadwal Bentrok"
  const [expandedPreview, setExpandedPreview] = useState<Record<string, boolean>>({});

  const [toastMsg, setToastMsg] = useState<{
    title: string;
    desc: string;
    visible: boolean;
  } | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch("/api/jadwal");
        const data = await res.json();
        if (Array.isArray(data)) setDataJadwal(data);
        else setDataJadwal([]);
      } catch (err) {
        console.error("Gagal fetch:", err);
        setDataJadwal([]);
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, []);

  const showToast = (title: string, desc: string) => {
    setToastMsg({ title, desc, visible: true });
    setTimeout(() => {
      setToastMsg((prev) => (prev ? { ...prev, visible: false } : null));
    }, 5000);
  };

  const matkulSemesterIni = useMemo(() => {
    if (!Array.isArray(dataJadwal)) return [];
    return dataJadwal.filter((m) => m.semester === semester);
  }, [dataJadwal, semester]);

  const jadwalAktif = useMemo(() => {
    let aktif: any[] = [];
    if (!matkulSemesterIni.length) return [];

    Object.keys(pilihan).forEach((kodeMatkul) => {
      const matkulData = matkulSemesterIni.find((m) => m.kode === kodeMatkul);
      if (!matkulData) return;
      const pilihanTipe = pilihan[kodeMatkul];

      matkulData.paralel.forEach((sesi: any) => {
        const paralelDipilih = pilihanTipe[sesi.tipe as TipeKegiatan];
        if (paralelDipilih && sesi.paralel === paralelDipilih) {
          aktif.push({
            ...sesi,
            nama_matkul: matkulData.nama,
            kode: kodeMatkul,
          });
        }
      });
    });
    return aktif;
  }, [matkulSemesterIni, pilihan]);

  const days = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  const startHour = 6;
  const endHour = 18;
  const hours = Array.from(
    { length: endHour - startHour + 1 },
    (_, i) => startHour + i,
  );
  const ROW_HEIGHT = 65;

  const calculatePosition = (jamMulai: string, jamSelesai: string) => {
    const startMins = parseTime(jamMulai);
    const endMins = parseTime(jamSelesai);
    const top = ((startMins - startHour * 60) / 60) * ROW_HEIGHT;
    const height = ((endMins - startMins) / 60) * ROW_HEIGHT;
    return { top, height };
  };

  const toggleMatkul = (kode: string, matkulData: any, completelyBlocked: boolean = false) => {
    if (!kode || !matkulData) return;

    // Hapus matkul jika sudah ada
    if (pilihan[kode]) {
      setPilihan((prev) => {
        const newPilihan = { ...prev };
        delete newPilihan[kode];
        return newPilihan;
      });
      // Tutup preview (jika ada) saat dihapus
      setExpandedPreview(prev => { const n = {...prev}; delete n[kode]; return n; });
      return;
    }

    // Jika 100% bentrok: TIDAK DITAMBAHKAN, TAPI DIBUKA PREVIEWNYA
    if (completelyBlocked) {
       setExpandedPreview(prev => ({...prev, [kode]: !prev[kode]}));
       if (!expandedPreview[kode]) {
          showToast("Mata Kuliah Bentrok!", "Semua paralel bertabrakan dengan jadwalmu. Silakan cek detail di bawah untuk strategi ulang.");
       }
       return; 
    }

    // Logika jika aman untuk ditambah
    const jenisTersedia = Array.from(
      new Set(matkulData.paralel.map((p: any) => p.tipe)),
    ) as string[];
    const bestPilihan: any = {};

    for (const tipe of jenisTersedia) {
      const sesiTipeIni = matkulData.paralel.filter(
        (p: any) => p.tipe === tipe,
      );
      const unikParalels = Array.from(
        new Set(sesiTipeIni.map((p: any) => p.paralel)),
      ).sort() as number[];

      for (const pNo of unikParalels) {
        const sesiTarget = sesiTipeIni.filter((s: any) => s.paralel === pNo);
        let clashInParalel = false;

        for (const s of sesiTarget) {
          for (const active of jadwalAktif) {
            if (isOverlap(s, active)) {
              clashInParalel = true;
              break;
            }
          }
          if (clashInParalel) break;
        }

        if (!clashInParalel) {
          bestPilihan[tipe] = pNo;
          break;
        }
      }
    }

    setPilihan((prev) => ({
      ...prev,
      [kode]: bestPilihan,
    }));
  };

  const gantiParalel = (
    kode: string,
    matkulData: any,
    tipe: TipeKegiatan,
    val: number,
  ) => {
    if (!kode || !matkulData) return;

    const requestedSessions = matkulData.paralel.filter(
      (p: any) => p.tipe === tipe && p.paralel === val,
    );
    let clashingSession: any = null;

    for (const req of requestedSessions) {
      for (const active of jadwalAktif) {
        if (active.kode === kode && active.tipe === tipe) continue;
        if (isOverlap(req, active)) {
          clashingSession = active;
          break;
        }
      }
      if (clashingSession) break;
    }

    // Tolak perubahan jika bentrok
    if (clashingSession) {
      showToast(
        "Jadwal Bentrok!",
        `Paralel ini bertabrakan dengan ${clashingSession?.nama_matkul || "Jadwal Lain"}.`,
      );
      return; 
    }

    setPilihan((prev) => ({
      ...prev,
      [kode]: { ...prev[kode], [tipe]: val },
    }));
  };

  const theme = {
    K: "bg-indigo-600 text-white shadow-indigo-200 border-indigo-500",
    P: "bg-teal-400 text-white shadow-teal-100 border-teal-400",
    R: "bg-yellow-300 text-gray-900 shadow-yellow-200 border-yellow-200",
  };

  if (isLoading)
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-50 font-sans">
        <div className="w-12 h-12 border-4 border-zinc-200 border-t-pink-600 rounded-full animate-spin mb-4"></div>
        <p className="font-bold text-zinc-600 tracking-tight">
          Menyinkronkan dari SIMAK IPB...
        </p>
      </div>
    );

  const totalSKS = Object.keys(pilihan).reduce(
    (acc, kode) =>
      acc + (matkulSemesterIni.find((m) => m.kode === kode)?.sks || 0),
    0,
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-4 md:p-8 font-sans flex flex-col xl:flex-row gap-8 relative overflow-hidden">
      
      {/* TOAST NOTIFICATION */}
      {toastMsg !== null && (
        <div
          className={`fixed top-8 left-1/2 z-[100] w-[90%] max-w-md transition-all duration-400 transform ${
            toastMsg.visible
              ? "-translate-x-1/2 translate-y-0 opacity-100"
              : "-translate-x-1/2 -translate-y-10 opacity-0 pointer-events-none"
          }`}
        >
          <div className="bg-slate-900 border border-slate-700 shadow-2xl rounded-2xl p-4 flex gap-4 items-start">
            <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center shrink-0 mt-0.5">
              <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="flex-1 pr-2">
              <h4 className="font-bold text-white tracking-tight leading-none mb-1.5">
                {toastMsg.title}
              </h4>
              <p className="text-[12px] text-slate-300 leading-relaxed font-medium">
                {toastMsg.desc}
              </p>
            </div>
            <button onClick={() => setToastMsg(null)} className="text-slate-500 hover:text-white transition-colors p-1">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* PANEL KIRI */}
      <div className="w-full xl:w-[380px] flex flex-col gap-6 relative z-10">
        <div className="bg-white p-6 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 flex flex-col gap-5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-pink-50 rounded-full blur-3xl -mr-10 -mt-10"></div>
          <div className="flex items-center gap-4 relative z-10">
            <div>
              <h2 className="text-2xl font-black text-slate-800 tracking-tight">
                KRS <span className="text-pink-500">ILKOMERZ.</span>
              </h2>
              <p className="text-[11px] font-bold text-slate-400 mt-1 tracking-wider">
                by Aaron 
              </p>
            </div>
          </div>
          <div className="relative z-10">
            <select
              className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-700 outline-none ring-pink-500 focus:ring-2 focus:bg-white transition-all appearance-none cursor-pointer shadow-sm"
              value={semester}
              onChange={(e) => {
                setSemester(Number(e.target.value));
                setPilihan({});
                setExpandedPreview({});
              }}
            >
              <option value={2}>Pilih Semester 2</option>
              <option value={4}>Pilih Semester 4</option>
              <option value={6}>Pilih Semester 6</option>
            </select>
            <div className="absolute right-4 top-4 pointer-events-none text-slate-400">▼</div>
          </div>
        </div>

        <div className="flex-1 flex flex-col gap-4 pb-10">
          {matkulSemesterIni.map((matkul) => {
            const diambil = !!pilihan[matkul.kode];
            const tipeTersedia = Array.from(new Set(matkul.paralel.map((p: any) => p.tipe))) as TipeKegiatan[];

            // Cek apakah matkul ini diblokir total jika diambil
            let isCompletelyBlocked = false;
            if (!diambil) {
              for (const tipe of tipeTersedia) {
                const sesiTipeIni = matkul.paralel.filter((p: any) => p.tipe === tipe);
                const unikParalels = Array.from(new Set(sesiTipeIni.map((p: any) => p.paralel))) as number[];

                let foundSafe = false;
                for (const pNo of unikParalels) {
                  const sesiTarget = sesiTipeIni.filter((s: any) => s.paralel === pNo);
                  let clashInParalel = false;
                  for (const s of sesiTarget) {
                    for (const active of jadwalAktif) {
                      if (isOverlap(s, active)) {
                        clashInParalel = true;
                        break;
                      }
                    }
                    if (clashInParalel) break;
                  }
                  if (!clashInParalel) {
                    foundSafe = true;
                    break;
                  }
                }
                if (!foundSafe) {
                  isCompletelyBlocked = true;
                  break;
                }
              }
            }

            const isPreviewing = expandedPreview[matkul.kode] && isCompletelyBlocked;

            return (
              <div
                key={matkul.kode}
                className={`p-4 rounded-3xl transition-all duration-300 border ${
                  diambil
                    ? "bg-white border-pink-200 shadow-[0_8px_20px_rgb(236,72,153,0.08)] ring-1 ring-pink-100"
                    : isCompletelyBlocked
                    ? (isPreviewing ? "bg-red-50/60 border-red-200 shadow-md" : "bg-red-50/30 border-red-100 hover:opacity-100 cursor-pointer")
                    : "bg-white border-slate-100 shadow-sm hover:border-slate-300 hover:shadow-md cursor-pointer"
                }`}
              >
                <div
                  className="flex items-start gap-4 cursor-pointer"
                  onClick={() => toggleMatkul(matkul.kode, matkul, isCompletelyBlocked)}
                >
                  <div
                    className={`mt-1 flex items-center justify-center w-6 h-6 shrink-0 rounded-lg border-2 transition-colors ${diambil ? "bg-pink-500 border-pink-500" : isCompletelyBlocked ? "bg-red-100 border-red-200" : "bg-white border-slate-300"}`}
                  >
                    {diambil && (
                      <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                    {!diambil && isCompletelyBlocked && (
                      <span className="text-[10px] font-bold text-red-400">!</span>
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start gap-2">
                      <p className={`font-bold text-[14px] leading-snug tracking-tight ${diambil ? "text-indigo-950" : isCompletelyBlocked ? "text-red-900" : "text-slate-700"}`}>
                        {matkul.nama}
                      </p>
                      {isCompletelyBlocked && !diambil && (
                        <span className="shrink-0 text-[8px] px-2 py-0.5 rounded-md bg-red-100 text-red-600 font-black tracking-wider border border-red-200">
                          BENTROK
                        </span>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold tracking-wider ${isCompletelyBlocked && !diambil ? "bg-red-50 text-red-400" : "bg-slate-100 text-slate-500"}`}>
                        {matkul.kode}
                      </span>
                      <span className={`text-[10px] font-semibold ${isCompletelyBlocked && !diambil ? "text-red-400/80" : "text-slate-400"}`}>
                        • {matkul.sks} SKS
                      </span>
                    </div>
                  </div>
                </div>

                {/* AREA PREVIEW JADWAL BENTROK */}
                {isPreviewing && !diambil && (
                  <div className="ml-10 mt-4 space-y-2 pt-4 border-t border-red-100/80">
                    <p className="text-[10px] font-black text-red-500 uppercase tracking-wider mb-2">Jadwal Tersedia:</p>
                    {tipeTersedia.map((tipe) => {
                      const sesiTipeIni = matkul.paralel.filter((p: any) => p.tipe === tipe);
                      const unikParalels = Array.from(new Set(sesiTipeIni.map((p: any) => p.paralel))).sort() as number[];
                      return (
                        <div key={tipe} className="flex flex-col gap-1.5">
                          {unikParalels.map(pNo => {
                             const info = sesiTipeIni.find((s:any)=>s.paralel === pNo);
                             return (
                               <div key={pNo} className="flex items-center gap-2 text-[10px] bg-white p-2 rounded-lg border border-red-100 shadow-sm">
                                 <span className="font-black text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-100">{tipe}-{pNo}</span>
                                 <span className="font-semibold text-slate-600">{info?.hari}, {info?.jam_mulai}-{info?.jam_selesai}</span>
                               </div>
                             )
                          })}
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* AREA AKTIF / DIAMBIL */}
                {diambil && (
                  <div className="ml-10 mt-4 space-y-3 pt-4 border-t border-slate-100/80">
                    {tipeTersedia.map((tipe) => {
                      const sesiTipeIni = matkul.paralel.filter((p: any) => p.tipe === tipe);
                      const paralelUnik = Array.from(new Set(sesiTipeIni.map((p: any) => p.paralel))).sort() as number[];
                      
                      const label = tipe === "K" ? "Kuliah" : tipe === "P" ? "Praktikum" : "Responsi";
                      const colorBadge = tipe === "K" ? "text-indigo-600 bg-indigo-50" : tipe === "P" ? "text-teal-600 bg-teal-50" : "text-yellow-600 bg-yellow-50";

                      return (
                        <div key={tipe} className="flex flex-col gap-1.5">
                          <label className={`text-[10px] w-fit font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${colorBadge}`}>
                            {label}
                          </label>
                          <div className="relative">
                            <select
                              className="w-full p-2.5 pl-3 pr-8 text-[11px] border border-slate-200 rounded-xl bg-slate-50/50 outline-none focus:ring-2 focus:ring-pink-500/50 focus:bg-white font-semibold text-slate-700 transition-all appearance-none cursor-pointer"
                              value={pilihan[matkul.kode]?.[tipe] || 1}
                              onChange={(e) => {
                                gantiParalel(matkul.kode, matkul, tipe as TipeKegiatan, Number(e.target.value));
                              }}
                            >
                              {paralelUnik.map((pNo: number) => {
                                const info = sesiTipeIni.find((s: any) => s.paralel === pNo);
                                const sesiTarget = sesiTipeIni.filter((s: any) => s.paralel === pNo);
                                
                                // Cek untuk mematikan opsi dropdown yang bentrok
                                let isOptionBentrok = false;
                                for (const s of sesiTarget) {
                                  for (const active of jadwalAktif) {
                                    if (active.kode === matkul.kode && active.tipe === tipe) continue;
                                    if (isOverlap(s, active)) {
                                      isOptionBentrok = true;
                                      break;
                                    }
                                  }
                                  if (isOptionBentrok) break;
                                }

                                return (
                                  <option key={pNo} value={pNo} disabled={isOptionBentrok}>
                                    {tipe}-{pNo} | {info?.hari}, {info?.jam_mulai}-{info?.jam_selesai} {isOptionBentrok ? " ❌ (Bentrok)" : ""}
                                  </option>
                                );
                              })}
                            </select>
                            <div className="absolute right-3 top-2.5 pointer-events-none text-slate-400 text-[10px]">
                              ▼
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* PANEL KANAN - KALENDER & TABEL */}
      <div className="flex-1 flex flex-col gap-6 relative z-10">
        <div className="flex flex-col sm:flex-row justify-between items-center bg-white p-4 px-6 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 gap-4">
          <div className="flex gap-4 md:gap-6 text-[11px] font-black tracking-widest text-slate-500">
            <span className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-indigo-600 shadow-[0_0_10px_rgb(79,70,229,0.5)]"></div> KULIAH</span>
            <span className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-teal-400 shadow-[0_0_10px_rgb(20,184,166,0.5)]"></div> PRAKTIKUM</span>
            <span className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-yellow-300 shadow-[0_0_10px_rgb(253,224,71,0.5)]"></div> RESPONSI</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-slate-400">Total Kredit Terambil</span>
            <div className="text-xl font-black text-pink-950 bg-pink-50 px-4 py-1.5 rounded-2xl border border-pink-100 shadow-sm">
              {totalSKS} <span className="text-sm font-bold text-pink-500">SKS</span>
            </div>
          </div>
        </div>

        {/* KALENDER */}
        <div className="bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 overflow-hidden">
          <div className="block sm:hidden p-5">
            <h3 className="font-bold text-slate-800 tracking-tight mb-5 flex items-center gap-2">
              <div className="w-2 h-5 bg-indigo-500 rounded-full"></div> Agenda Jadwalmu
            </h3>
            {jadwalAktif.length === 0 ? (
              <div className="p-8 text-center border border-dashed border-slate-200 rounded-2xl">
                <p className="text-slate-400 font-medium text-xs">Jadwal masih kosong.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-5">
                {days.map((day) => {
                  const jadwalHariIni = jadwalAktif.filter((j) => j.hari.replace(/'/g, "") === day).sort((a, b) => parseTime(a.jam_mulai) - parseTime(b.jam_mulai));
                  if (jadwalHariIni.length === 0) return null;

                  return (
                    <div key={day} className="flex flex-col gap-3">
                      <div className="flex items-center">
                        <span className="px-3 py-1 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-black uppercase tracking-widest border border-slate-200 shadow-sm">{day}</span>
                      </div>
                      <div className="flex flex-col gap-3 border-l-2 border-slate-100 ml-4 pl-4 py-1">
                        {jadwalHariIni.map((kelas, idx) => {
                          const styleKategori = theme[kelas.tipe as TipeKegiatan];
                          return (
                            <div key={idx} className={`relative rounded-xl p-3 shadow-sm ${styleKategori}`}>
                              <div className="absolute -left-[23px] top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white border-[3px] border-slate-300 rounded-full"></div>
                              <div className="flex justify-between items-start mb-1.5">
                                <span className="text-[10px] font-bold bg-white/20 px-2 py-0.5 rounded-md tracking-wider">
                                  {kelas.jam_mulai} - {kelas.jam_selesai}
                                </span>
                                <span className="text-[10px] font-black bg-white/90 text-slate-800 px-2 py-0.5 rounded-md">
                                  {kelas.tipe}-{kelas.paralel}
                                </span>
                              </div>
                              <p className="text-xs font-bold leading-snug tracking-tight">{kelas.nama_matkul}</p>
                              <p className="text-[10px] mt-1.5 font-medium opacity-90 flex items-center gap-1">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path></svg>
                                {kelas.ruangan}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="hidden sm:block overflow-x-auto p-6 scrollbar-hide">
            <div className="min-w-[800px]">
              <div className="flex mb-4">
                <div className="w-16 shrink-0"></div>
                {days.map((d) => (
                  <div key={d} className="flex-1 text-center">
                    <div className="inline-block px-4 py-1.5 rounded-xl bg-slate-50 text-[11px] font-black tracking-widest text-slate-500 uppercase border border-slate-100">{d}</div>
                  </div>
                ))}
              </div>
              <div className="flex relative">
                <div className="w-16 shrink-0 relative">
                  {hours.map((h) => (
                    <div key={h} style={{ height: ROW_HEIGHT }} className="relative">
                      <span className="absolute -top-2 right-4 text-[11px] font-black text-slate-300">{h.toString().padStart(2, "0")}:00</span>
                    </div>
                  ))}
                </div>
                <div className="absolute inset-0 ml-16 flex flex-col pointer-events-none">
                  {hours.map((h) => (
                    <div key={h} style={{ height: ROW_HEIGHT }} className="border-t border-dashed border-slate-200 w-full"></div>
                  ))}
                </div>
                {days.map((day) => (
                  <div key={day} className="flex-1 relative border-l border-dashed border-slate-100 first:border-l-0" style={{ marginLeft: 0 }}>
                    {jadwalAktif.filter((j) => j.hari.replace(/'/g, "") === day).map((kelas, idx) => {
                        const pos = calculatePosition(kelas.jam_mulai, kelas.jam_selesai);
                        const styleKategori = theme[kelas.tipe as TipeKegiatan];
                        return (
                          <div key={idx} style={{ top: pos.top, height: pos.height }} className={`absolute left-1 right-1 rounded-2xl p-2.5 shadow-lg flex flex-col transition-transform hover:scale-[1.03] hover:z-20 border border-white/20 backdrop-blur-sm ${styleKategori}`}>
                            <div className="flex justify-between items-start mb-1">
                              <span className="text-[9px] font-bold bg-white/20 px-1.5 py-0.5 rounded-md tracking-wider">{kelas.jam_mulai}-{kelas.jam_selesai}</span>
                              <span className="text-[9px] font-black bg-white/90 text-slate-800 px-1.5 py-0.5 rounded-md">{kelas.tipe}-{kelas.paralel}</span>
                            </div>
                            <p className="text-[11px] font-bold leading-tight tracking-tight mt-1 line-clamp-2">{kelas.nama_matkul}</p>
                            <p className="text-[9px] mt-auto font-medium opacity-90 truncate flex items-center gap-1">
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path></svg>
                              {kelas.ruangan}
                            </p>
                          </div>
                        );
                      })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* TABEL SUMMARY / KARTU RESPONSIVE */}
        <div className="bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 overflow-hidden mb-10">
          <div className="p-6 border-b border-slate-100 flex items-center gap-3">
            <div className="w-2 h-6 bg-pink-500 rounded-full"></div>
            <h3 className="font-bold text-slate-800 tracking-tight">Rincian Mata Kuliah Terpilih</h3>
          </div>

          <div className="p-2 sm:p-0">
            <div className="flex flex-col gap-3 sm:hidden px-2 pb-4 pt-2">
              {Object.keys(pilihan).length === 0 ? (
                <div className="p-8 text-center border border-dashed border-slate-200 rounded-2xl">
                  <p className="text-slate-400 font-medium text-sm">Belum ada kelas yang disetujui.</p>
                </div>
              ) : (
                Object.keys(pilihan).map((kode) => {
                  const m = matkulSemesterIni.find((x) => x.kode === kode);
                  const p = pilihan[kode];
                  return (
                    <div key={kode} className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex flex-col gap-3">
                      <div className="flex justify-between items-start gap-3">
                        <div>
                          <p className="font-bold text-sm text-slate-800 leading-tight">{m?.nama}</p>
                          <p className="text-[11px] font-bold text-slate-400 mt-1">{kode}</p>
                        </div>
                        <span className="shrink-0 bg-white border border-slate-200 text-slate-600 font-bold px-2.5 py-1 rounded-lg text-xs shadow-sm">{m?.sks} SKS</span>
                      </div>
                      <div className="flex flex-col gap-2">
                        {Object.entries(p).map(([tipe, noParalel]) => {
                          const infoJadwal = m?.paralel.find((s: any) => s.tipe === tipe && s.paralel === noParalel);
                          const typeConfig = {
                            K: { label: "KULIAH", bg: "bg-indigo-100 text-indigo-700" },
                            P: { label: "PRAKTIKUM", bg: "bg-teal-100 text-teal-600" },
                            R: { label: "RESPONSI", bg: "bg-yellow-100 text-yellow-700" },
                          }[tipe as TipeKegiatan];

                          return (
                            <div key={tipe} className="flex flex-wrap items-center gap-2 text-[11px] p-3 rounded-xl bg-white border border-slate-100 shadow-sm">
                              <span className={`px-2 py-1 rounded-md font-black text-[9px] tracking-wider ${typeConfig?.bg}`}>{typeConfig?.label}</span>
                              <span className="font-black text-slate-700 bg-slate-50 px-2 py-1 rounded-md border border-slate-100">{tipe}-{noParalel}</span>
                              <span className="font-bold text-slate-600">{infoJadwal?.hari}, <span className="text-slate-500 font-medium">{infoJadwal?.jam_mulai}-{infoJadwal?.jam_selesai}</span></span>
                              <span className="text-slate-400 font-medium flex items-center gap-1.5 w-full mt-1.5 pt-1.5 border-t border-slate-50">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path></svg>
                                {infoJadwal?.ruangan}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="hidden sm:block overflow-x-auto p-2">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                    <th className="p-4 pl-6 font-medium">Mata Kuliah</th>
                    <th className="p-4 text-center font-medium">SKS</th>
                    <th className="p-4 font-medium">Jadwal & Paralel</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.keys(pilihan).length === 0 ? (
                    <tr>
                      <td colSpan={3} className="p-12 text-center">
                        <p className="text-slate-400 font-medium">Belum ada kelas yang disetujui.</p>
                      </td>
                    </tr>
                  ) : (
                    Object.keys(pilihan).map((kode) => {
                      const m = matkulSemesterIni.find((x) => x.kode === kode);
                      const p = pilihan[kode];
                      return (
                        <tr key={kode} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors group">
                          <td className="p-4 pl-6 align-top">
                            <p className="font-bold text-sm text-slate-800 group-hover:text-pink-600 transition-colors">{m?.nama}</p>
                            <p className="text-[11px] font-bold text-slate-400 mt-0.5">{kode}</p>
                          </td>
                          <td className="p-4 align-top text-center">
                            <span className="inline-block bg-slate-100 text-slate-600 font-bold px-3 py-1 rounded-xl text-xs">{m?.sks}</span>
                          </td>
                          <td className="p-4 align-top">
                            <div className="flex flex-col gap-2">
                              {Object.entries(p).map(([tipe, noParalel]) => {
                                const infoJadwal = m?.paralel.find((s: any) => s.tipe === tipe && s.paralel === noParalel);
                                const typeConfig = {
                                  K: { label: "KULIAH", bg: "bg-indigo-100 text-indigo-700" },
                                  P: { label: "PRAKTIKUM", bg: "bg-teal-100 text-teal-700" },
                                  R: { label: "RESPONSI", bg: "bg-yellow-100 text-yellow-700" },
                                }[tipe as TipeKegiatan];

                                return (
                                  <div key={tipe} className="flex flex-wrap items-center gap-2 text-[11px] p-2 rounded-xl bg-slate-50 border border-slate-100/50">
                                    <span className={`px-2 py-1 rounded-lg font-black text-[9px] tracking-wider ${typeConfig?.bg}`}>{typeConfig?.label}</span>
                                    <span className="font-black text-slate-700 bg-white px-2 py-1 rounded-lg shadow-sm border border-slate-100">{tipe}-{noParalel}</span>
                                    <span className="font-bold text-slate-600">{infoJadwal?.hari}, <span className="text-slate-500 font-medium">{infoJadwal?.jam_mulai} - {infoJadwal?.jam_selesai}</span></span>
                                    <span className="text-slate-400 font-medium ml-auto flex items-center gap-1 bg-white px-2 py-1 rounded-lg border border-slate-100">
                                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path></svg>
                                      {infoJadwal?.ruangan}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}