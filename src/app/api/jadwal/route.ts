  import { NextResponse } from "next/server";
  import * as cheerio from "cheerio";

  export async function GET() {
    try {
      const response = await fetch(
        "https://simak.ipb.ac.id/Publik/JadwalKuliah?StrataID=2&TahunSemesterID=114&MayorID=237",
      );
      const html = await response.text();

      const $ = cheerio.load(html);

      let currentDay = "";
      const hasilJadwal: any[] = [];

      // daftar yang hanya 2 sks
      const daftarSKS: Record<string, number> = {
        "KOM120G": 2, // Orkom
        "KOM1304": 2, // Grafika
        "KOM1315" : 2, // keamanan informasi
        "KOM1326" : 2, //Pengantar Kecerdasan Komputasional
        "KOM1398" : 2, //Metode Penelitian dan Telaah Pustaka

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