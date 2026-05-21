import bcrypt from "bcryptjs";
import { getServerSupabaseClient } from "@/lib/supabase-server";

export type SignupState = {
  error: string;
  success: string;
  returnTo?: string;
};

export type PendingSiswa = {
  id_siswa: number;
  nama: string;
  nisn: string | null;
  username: string | null;
  email: string | null;
  kelas: string | null;
  tahun_masuk: number | null;
  nomor_whatsapp: string | null;
  status_keanggotaan: string | null;
};

export type SiswaAccount = PendingSiswa & {
  password_tersedia: boolean;
};

export const siswaAccountLimitOptions = [5, 10, 25, 50, 100] as const;
export const defaultSiswaAccountLimit = 5;

export type SiswaAccountTab = "registered" | "pending";
export type SiswaAccountSortKey = "nisn" | "nama" | "kelas";
export type SiswaAccountSortDirection = "asc" | "desc";
export type SiswaAccountStatusFilter = "aktif" | "nonaktif" | null;

export type SiswaAccountFilters = {
  tab: SiswaAccountTab;
  search: string;
  status: SiswaAccountStatusFilter;
  sort: SiswaAccountSortKey | null;
  direction: SiswaAccountSortDirection;
  limit: number;
  page: number;
};

export type SiswaAccountPage = {
  siswa: SiswaAccount[];
  total: number;
  registeredTotal: number;
  pendingTotal: number;
  page: number;
  limit: number;
  pageCount: number;
};

const siswaAccountSelect =
  "id_siswa, nama, nisn, username, email, kelas, tahun_masuk, nomor_whatsapp, status_keanggotaan, password";

function normalizeValue(value: string | null) {
  return value?.trim() ?? "";
}

function toSiswaAccount(row: PendingSiswa & { password: string | null }) {
  const { password, ...siswa } = row;

  return {
    ...siswa,
    password_tersedia: Boolean(password),
  } satisfies SiswaAccount;
}

function sanitizeSearchFilter(value: string) {
  return value.replace(/[,%]/g, " ").trim();
}

async function checkExistingSiswa(
  nama: string,
  nisn: string,
  username: string,
  email: string
) {
  const supabase = getServerSupabaseClient();

  const [nameCheck, nisnCheck, usernameCheck, emailCheck] = await Promise.all([
    supabase
      .from("siswa")
      .select("id_siswa")
      .ilike("nama", nama)
      .limit(1)
      .maybeSingle(),
    supabase
      .from("siswa")
      .select("id_siswa")
      .eq("nisn", nisn)
      .limit(1)
      .maybeSingle(),
    supabase
      .from("siswa")
      .select("id_siswa")
      .eq("username", username)
      .limit(1)
      .maybeSingle(),
    supabase
      .from("siswa")
      .select("id_siswa")
      .eq("email", email)
      .limit(1)
      .maybeSingle(),
  ]);

  if (nameCheck.error) {
    throw new Error(`Failed to validate nama siswa: ${nameCheck.error.message}`);
  }

  if (nisnCheck.error) {
    throw new Error(`Failed to validate NISN: ${nisnCheck.error.message}`);
  }

  if (usernameCheck.error) {
    throw new Error(
      `Failed to validate username siswa: ${usernameCheck.error.message}`
    );
  }

  if (emailCheck.error) {
    throw new Error(`Failed to validate email siswa: ${emailCheck.error.message}`);
  }

  if (nameCheck.data) {
    return "Nama lengkap sudah digunakan.";
  }

  if (nisnCheck.data) {
    return "NISN sudah terdaftar.";
  }

  if (usernameCheck.data) {
    return "Username sudah digunakan.";
  }

  if (emailCheck.data) {
    return "Email sudah digunakan.";
  }

  return null;
}

export async function registerSiswaAccount(formData: FormData): Promise<SignupState> {
  const returnTo = normalizeValue(String(formData.get("return_to") ?? ""));
  const nama = normalizeValue(String(formData.get("nama") ?? ""));
  const nisn = normalizeValue(String(formData.get("nisn") ?? ""));
  const tahunMasuk = normalizeValue(String(formData.get("tahun_masuk") ?? ""));
  const nomorWhatsapp = normalizeValue(String(formData.get("nomor_whatsapp") ?? ""));
  const email = normalizeValue(String(formData.get("email") ?? "")).toLowerCase();
  const username = normalizeValue(String(formData.get("username") ?? "")).toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirm_password") ?? "");
  const kelas = normalizeValue(String(formData.get("kelas") ?? ""));

  if (
    !nama ||
    !nisn ||
    !tahunMasuk ||
    !nomorWhatsapp ||
    !email ||
    !username ||
    !password ||
    !confirmPassword ||
    !kelas
  ) {
    return {
      error: "Semua data siswa wajib diisi.",
      success: "",
      returnTo,
    };
  }

  if (password.length < 8) {
    return {
      error: "Password minimal 8 karakter.",
      success: "",
      returnTo,
    };
  }

  if (password !== confirmPassword) {
    return {
      error: "Konfirmasi password belum sama.",
      success: "",
      returnTo,
    };
  }

  const duplicateMessage = await checkExistingSiswa(nama, nisn, username, email);

  if (duplicateMessage) {
    return {
      error: duplicateMessage,
      success: "",
      returnTo,
    };
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const supabase = getServerSupabaseClient();

  const { error } = await supabase.from("siswa").insert({
    nama,
    nisn,
    tahun_masuk: Number(tahunMasuk),
    nomor_whatsapp: nomorWhatsapp,
    email,
    username,
    password: passwordHash,
    kelas,
    status_keanggotaan: "menunggu_verifikasi",
  } as never);

  if (error) {
    throw new Error(`Failed to register siswa: ${error.message}`);
  }

  return {
    error: "",
    success:
      "Pendaftaran berhasil. Akun kamu sedang menunggu verifikasi admin perpustakaan.",
    returnTo,
  };
}

export async function getPendingSiswaRegistrations() {
  const supabase = getServerSupabaseClient();

  const { data, error } = await supabase
    .from("siswa")
    .select(
      "id_siswa, nama, nisn, username, email, kelas, tahun_masuk, nomor_whatsapp, status_keanggotaan"
    )
    .eq("status_keanggotaan", "menunggu_verifikasi")
    .order("id_siswa", { ascending: false })
    .returns<PendingSiswa[]>();

  if (error) {
    throw new Error(`Failed to load pending siswa: ${error.message}`);
  }

  return data ?? [];
}

export async function getAllSiswaAccounts() {
  const supabase = getServerSupabaseClient();

  const { data, error } = await supabase
    .from("siswa")
    .select(siswaAccountSelect)
    .order("id_siswa", { ascending: false })
    .returns<(PendingSiswa & { password: string | null })[]>();

  if (error) {
    throw new Error(`Failed to load siswa accounts: ${error.message}`);
  }

  return (data ?? []).map(toSiswaAccount);
}

export async function getSiswaAccountPage(
  filters: SiswaAccountFilters
): Promise<SiswaAccountPage> {
  const supabase = getServerSupabaseClient();
  const from = (filters.page - 1) * filters.limit;
  const to = from + filters.limit - 1;
  const search = sanitizeSearchFilter(filters.search);

  const [registeredCount, pendingCount] = await Promise.all([
    supabase
      .from("siswa")
      .select("id_siswa", { count: "exact", head: true })
      .neq("status_keanggotaan", "menunggu_verifikasi"),
    supabase
      .from("siswa")
      .select("id_siswa", { count: "exact", head: true })
      .eq("status_keanggotaan", "menunggu_verifikasi"),
  ]);

  if (registeredCount.error) {
    throw new Error(
      `Failed to count registered siswa: ${registeredCount.error.message}`
    );
  }

  if (pendingCount.error) {
    throw new Error(`Failed to count pending siswa: ${pendingCount.error.message}`);
  }

  let query = supabase
    .from("siswa")
    .select(siswaAccountSelect, { count: "exact" });

  if (filters.tab === "pending") {
    query = query.eq("status_keanggotaan", "menunggu_verifikasi");
  } else {
    query = query.neq("status_keanggotaan", "menunggu_verifikasi");

    if (filters.status) {
      query = query.eq("status_keanggotaan", filters.status);
    }
  }

  if (search) {
    const pattern = `%${search}%`;
    query = query.or(
      [
        `nisn.ilike.${pattern}`,
        `nama.ilike.${pattern}`,
        `kelas.ilike.${pattern}`,
        `email.ilike.${pattern}`,
        `username.ilike.${pattern}`,
        `nomor_whatsapp.ilike.${pattern}`,
      ].join(",")
    );
  }

  if (filters.sort) {
    query = query.order(filters.sort, { ascending: filters.direction === "asc" });
  } else {
    query = query.order("id_siswa", { ascending: false });
  }

  const { data, error, count } = await query
    .range(from, to)
    .returns<(PendingSiswa & { password: string | null })[]>();

  if (error) {
    throw new Error(`Failed to load siswa account page: ${error.message}`);
  }

  const total = count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / filters.limit));

  return {
    siswa: (data ?? []).map(toSiswaAccount),
    total,
    registeredTotal: registeredCount.count ?? 0,
    pendingTotal: pendingCount.count ?? 0,
    page: filters.page,
    limit: filters.limit,
    pageCount,
  };
}
