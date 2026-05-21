"use server";

import { revalidatePath } from "next/cache";
import { getServerSupabaseClient } from "@/lib/supabase-server";
import { getSessionUser } from "@/modules/access/lib/session";
import { getSiswaAttendanceToday } from "@/modules/library/lib/data";

export type AttendanceState = {
  error: string;
  success: string;
};

function toTitleCase(value: string) {
  return value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

async function removeInsertedAttendance(idAbsensi: number) {
  const supabase = getServerSupabaseClient();

  await supabase.from("absensi").delete().eq("id_absensi", idAbsensi);
}

export async function submitPublicAttendance(
  _prevState: AttendanceState | undefined,
  formData: FormData
) {
  const nama = String(formData.get("nama") ?? "").trim();
  const asal = String(formData.get("asal") ?? "").trim();
  const tujuan = String(formData.get("tujuan") ?? "").trim();
  const jenisPengunjungRaw = String(formData.get("jenis_pengunjung") ?? "").trim();
  const idSiswaRaw = String(formData.get("id_siswa") ?? "").trim();

  if (jenisPengunjungRaw !== "siswa" && jenisPengunjungRaw !== "umum") {
    return {
      error: "Pilih jenis pengunjung terlebih dahulu.",
      success: "",
    };
  }

  const jenisPengunjung = jenisPengunjungRaw === "siswa" ? "siswa" : "umum";

  if (!nama || !tujuan || (jenisPengunjung === "umum" && !asal)) {
    return { error: "Semua field absensi publik wajib diisi.", success: "" };
  }

  const supabase = getServerSupabaseClient();

  let namaFinal = toTitleCase(nama);
  let kelasFinal = asal;
  let idSiswaFinal: number | null = null;

  if (jenisPengunjung === "siswa") {
    const idSiswa = Number(idSiswaRaw);

    if (!Number.isInteger(idSiswa) || idSiswa <= 0) {
      return {
        error: "Nama siswa belum terdaftar. Daftar dulu lalu minta pustakawan menyetujui akun.",
        success: "",
      };
    }

    const selectedSiswa = await supabase
      .from("siswa")
      .select("id_siswa, nama, kelas, status_keanggotaan")
      .eq("id_siswa", idSiswa)
      .single<{
        id_siswa: number;
        nama: string;
        kelas: string | null;
        status_keanggotaan: string | null;
      }>();

    if (selectedSiswa.error || !selectedSiswa.data) {
      return {
        error: "Nama siswa belum terdaftar. Daftar dulu lalu kembali ke absensi publik.",
        success: "",
      };
    }

    if (selectedSiswa.data.status_keanggotaan === "nonaktif") {
      return {
        error: "Akun siswa nonaktif. Hubungi pustakawan sebelum melakukan absensi.",
        success: "",
      };
    }

    namaFinal = toTitleCase(selectedSiswa.data.nama);
    kelasFinal = selectedSiswa.data.kelas?.trim() || "-";
    idSiswaFinal = selectedSiswa.data.id_siswa;
  }

  const insertAbsensi = await supabase
    .from("absensi")
    .insert({
      nama: namaFinal,
      tujuan,
      jenis_pengunjung: jenisPengunjung,
    } as never)
    .select("id_absensi")
    .single<{ id_absensi: number }>();

  if (insertAbsensi.error) {
    return {
      error: `Gagal menyimpan absensi publik: ${insertAbsensi.error.message}`,
      success: "",
    };
  }

  if (jenisPengunjung === "siswa") {
    const insertSiswa = await supabase.from("absensi_siswa").insert({
      id_absensi: insertAbsensi.data.id_absensi,
      id_siswa: idSiswaFinal,
      kelas_saat_absen: kelasFinal,
    } as never);

    if (insertSiswa.error) {
      await removeInsertedAttendance(insertAbsensi.data.id_absensi);

      return {
        error: `Gagal menyimpan kelas siswa: ${insertSiswa.error.message}`,
        success: "",
      };
    }
  } else {
    const insertUmum = await supabase.from("absensi_umum").insert({
      id_absensi: insertAbsensi.data.id_absensi,
      instansi_asal: asal,
    } as never);

    if (insertUmum.error) {
      await removeInsertedAttendance(insertAbsensi.data.id_absensi);

      return {
        error: `Gagal menyimpan instansi asal: ${insertUmum.error.message}`,
        success: "",
      };
    }
  }

  revalidatePath("/public");
  revalidatePath("/public/absensi");
  revalidatePath("/admin/absensi");

  return { error: "", success: "Absensi pengunjung berhasil disimpan." };
}

export async function submitSiswaAttendance(
  _prevState: AttendanceState | undefined,
  formData: FormData
) {
  const sessionUser = await getSessionUser();
  const tujuan =
    String(formData.get("tujuan") ?? "").trim() ||
    "Kunjungan perpustakaan siswa";

  if (!sessionUser || sessionUser.role !== "siswa") {
    return {
      error: "Sesi siswa tidak valid. Silakan login ulang.",
      success: "",
    };
  }

  const supabase = getServerSupabaseClient();
  let todayAttendance;

  try {
    todayAttendance = await getSiswaAttendanceToday(sessionUser.id);
  } catch {
    return {
      error: "Gagal memeriksa absensi hari ini. Coba lagi beberapa saat lagi.",
      success: "",
    };
  }

  if (todayAttendance) {
    return {
      error: "Kamu sudah melakukan absensi hari ini. Absensi hanya bisa sekali sehari.",
      success: "",
    };
  }

  const insertAbsensi = await supabase
    .from("absensi")
    .insert({
      nama: sessionUser.name,
      tujuan,
      jenis_pengunjung: "siswa",
    } as never)
    .select("id_absensi")
    .single<{ id_absensi: number }>();

  if (insertAbsensi.error) {
    return {
      error: `Gagal menyimpan absensi siswa: ${insertAbsensi.error.message}`,
      success: "",
    };
  }

  const insertSiswa = await supabase.from("absensi_siswa").insert({
    id_absensi: insertAbsensi.data.id_absensi,
    id_siswa: sessionUser.id,
    kelas_saat_absen: sessionUser.className ?? null,
  } as never);

  if (insertSiswa.error) {
    await removeInsertedAttendance(insertAbsensi.data.id_absensi);

    return {
      error: `Gagal menyimpan detail absensi siswa: ${insertSiswa.error.message}`,
      success: "",
    };
  }

  revalidatePath("/siswa");
  revalidatePath("/siswa/absensi");
  revalidatePath("/admin/absensi");

  return {
    error: "",
    success: "Absensi siswa berhasil disimpan.",
  };
}
