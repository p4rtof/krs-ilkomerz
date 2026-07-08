import { NextResponse } from "next/server";
import * as cheerio from "cheerio";

// Fungsi sakti biar kodingan auto-pilot
function getSimakSemesterID() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // Javascript ngitung bulan dari 0, makanya + 1

  // Base: Semester Ganjil 2023 = ID 116
  const ACADEMIC_BASE_YEAR = 2023;
  const BASE_GANJIL_ID = 116;

  // Tahun akademik IPB ganti tiap bulan Agustus (Bulan 8)
  const academicYear = month >= 8 ? year : year - 1;
  const selisihTahun = academicYear - ACADEMIC_BASE_YEAR;
  
  // Tiap tahun SIMAK nambah 3 ID (Ganjil, Genap, KKN)
  const currentGanjilId = BASE_GANJIL_ID + (selisihTahun * 3);

  // Kalo bulan 8 (Agustus) sampe 1 (Januari), berarti lagi Ganjil
  if (month >= 8 || month === 1) {
    return currentGanjilId;
  } 
  // Kalo bulan 2 (Februari) sampe 7 (Juli), berarti lagi Genap
  else {
    return currentGanjilId + 1; // +1 = Genap (KKN/Alih Tahun yang +2 otomatis ke-skip)
  }
}

export async function GET() {
  try {
    // Panggil fungsinya di sini
    const currentSemester = getSimakSemesterID(); 

    // Masukin variabelnya ke URL fetch SIMAK
    const response = await fetch(
      `https://simak.ipb.ac.id/Publik/JadwalKuliah?StrataID=2&TahunSemesterID=${currentSemester}&MayorID=237`
    );
    const html = await response.text();

    const $ = cheerio.load(html);

    let currentDay = "";
    const hasilJadwal: any[] = [];

    // const $ = cheerio.load(html);

    //   let currentDay = "";
    //   const hasilJadwal: any[] = [];

      // daftar yang hanya 2 sks
      const daftarSKS: Record<string, number> = {
        "KOM120G": 2, // Orkom
        "KOM1304": 2, // Grafika
        "KOM1315" : 2, // keamanan informasi
        "KOM1326" : 2, //Pengantar Kecerdasan Komputasional
        "KOM1398" : 2, //Metode Penelitian dan Telaah Pustaka
        "KOM133A" : 2, //Sistem Informasi
        "KOM2202" : 2, //Radig
        "KOM120I" : 2, //strukdis
      };

      $("table tbody tr").each((_, el) => {
        const td = $(el).find("td");

        if (td.length === 1) {
          currentDay = $(td.eq(0)).text().trim().replace(/'/g, "");
        } else if (td.length >= 8) {
          const jamRaw = td.eq(0).text().trim();
          const matkulRaw = td.eq(1).text().trim();
          const tipeKelasRaw = td.eq(2).text().trim();
          const ruangan = td.eq(4).text().trim();
          const semester = parseInt(td.eq(7).text().trim());

          if (!isNaN(semester)) {
            const [kode, ...namaArr] = matkulRaw.split("-");
            const kodeMatkul = kode.trim();
            const namaMatkul = namaArr.join("-").trim();

            const [tipe, paralel] = tipeKelasRaw.split("/");
            const [jamMulai, jamSelesai] = jamRaw.split("-");

            // 2. Tentukan SKS (Pakai daftarSKS atau default 3)
            const sksAkurat = daftarSKS[kodeMatkul] || 3;

            const sesiBaru = {
              tipe: tipe.trim(),
              paralel: parseInt(paralel),
              hari: currentDay,
              jam_mulai: jamMulai.trim(),
              jam_selesai: jamSelesai.trim(),
              ruangan: ruangan,
            };

            let matkulIndex = hasilJadwal.findIndex(
              (m) => m.kode === kodeMatkul && m.semester === semester,
            );

            if (matkulIndex !== -1) {
              hasilJadwal[matkulIndex].paralel.push(sesiBaru);
            } else {
              hasilJadwal.push({
                kode: kodeMatkul,
                nama: namaMatkul,
                sks: sksAkurat,
                semester: semester,
                paralel: [sesiBaru],
              });
            }
          }
        }
      });

      return NextResponse.json(hasilJadwal);
    } catch (error) {
      return NextResponse.json(
        { error: "Gagal mengambil data dari SIMAK" },
        { status: 500 },
      );
    }
  }