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

    $("table tbody tr").each((_, el) => {
      const td = $(el).find("td");

      if (td.length === 1) {
        currentDay = $(td.eq(0)).text().trim();
      } else if (td.length >= 8) {
        const jamRaw = td.eq(0).text().trim();
        const matkulRaw = td.eq(1).text().trim();
        const tipeKelasRaw = td.eq(2).text().trim();
        const ruangan = td.eq(4).text().trim();
        const semester = parseInt(td.eq(7).text().trim()); 

        if (!isNaN(semester)) {
          const [kode, ...namaArr] = matkulRaw.split("-");
          const namaMatkul = namaArr.join("-").trim();
          const [tipe, paralel] = tipeKelasRaw.split("/");
          const [jamMulai, jamSelesai] = jamRaw.split("-");

          const sesiBaru = {
            tipe: tipe.trim(),
            paralel: parseInt(paralel),
            hari: currentDay,
            jam_mulai: jamMulai.trim(),
            jam_selesai: jamSelesai.trim(),
            ruangan: ruangan,
          };

          let matkulIndex = hasilJadwal.findIndex(
            (m) => m.kode === kode.trim(),
          );

          if (matkulIndex !== -1) {
            hasilJadwal[matkulIndex].paralel.push(sesiBaru);
          } else {
            hasilJadwal.push({
              kode: kode.trim(),
              nama: namaMatkul,
              sks: 3,
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
