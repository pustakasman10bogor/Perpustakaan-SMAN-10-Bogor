"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerSupabaseClient } from "@/lib/supabase-server";
import {
  findSessionUserByCredentials,
  findSiswaAccountByIdentifier,
} from "@/modules/access/lib/database-auth";
import {
  registerSiswaAccount,
  type SignupState,
} from "@/modules/access/lib/student-registration";
import {
  clearSession,
  createSession,
  getSessionUser,
  type SessionUser,
  type UserRole,
} from "@/modules/access/lib/session";
import {
  updatePublicSessionPassword,
  verifyPublicSessionPassword,
} from "@/modules/access/lib/public-session-settings";

export type LoginState = {
  error: string;
};
export type PublicSessionPasswordState = {
  error: string;
  success: string;
};
export type LogoutState = {
  error: string;
};

export type SignupFormState = SignupState;
export type PasswordResetState = {
  error: string;
  success: string;
};
export type UpdateSiswaProfileState = {
  error: string;
  success: string;
  profile?: {
    nama: string;
    username: string;
    email: string;
    kelas: string;
    tahunMasuk: string;
    nomorWhatsapp: string;
  };
};
export type AdminProfileState = {
  error: string;
  success: string;
  profile?: {
    id: number;
    nama: string;
    username: string;
    email: string;
    nomorTelephone: string;
    supportsEmail: boolean;
    supportsNomorTelephone: boolean;
  };
};
export type SiswaAdminActionState = {
  error: string;
  success: string;
  siswa?: {
    id_siswa: number;
    nama: string;
    nisn: string;
    username: string;
    email: string;
    kelas: string;
    tahun_masuk: number;
    nomor_whatsapp: string;
    status_keanggotaan: string;
  };
};
export type DeleteSiswaActionState = {
  error: string;
  deleted: boolean;
  blockedByTransactions: boolean;
};

function redirectByRole(role: UserRole) {
  if (role === "admin") {
    redirect("/admin");
  }

  if (role === "siswa") {
    redirect("/siswa");
  }

  redirect("/public");
}

export async function loginFromHome(
  _prevState: LoginState | undefined,
  formData: FormData
) {
  const identifier = String(formData.get("identifier") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!identifier || !password) {
    return {
      error: "Nama, username, atau email dan password wajib diisi.",
    };
  }

  let sessionUser;

  try {
    sessionUser = await findSessionUserByCredentials(identifier, password);

    if (!sessionUser) {
      return {
        error: "Login gagal. Periksa kembali identifier dan password.",
      };
    }

    await createSession(sessionUser);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Terjadi kesalahan saat login.";

    if (message.includes("Missing Supabase server credentials")) {
      return {
        error:
          "Konfigurasi Supabase server belum siap. Pastikan .env.local berisi SUPABASE_SECRET_KEY yang aktif, lalu restart dev server.",
      };
    }

    if (process.env.NODE_ENV !== "production") {
      return {
        error: message.startsWith("Failed")
          ? `Supabase login error: ${message}`
          : message,
      };
    }

    return {
      error: "Login gagal. Periksa konfigurasi server dan kredensial database.",
    };
  }

  redirectByRole(sessionUser.role);
}

export async function signupSiswa(
  _prevState: SignupFormState | undefined,
  formData: FormData
) {
  try {
    const state = await registerSiswaAccount(formData);
    revalidatePath("/admin");
    revalidatePath("/public");
    revalidatePath("/public/absensi");
    return state;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Terjadi kesalahan saat mendaftar.";

    return {
      error: message,
      success: "",
    };
  }
}

export async function approveSiswaRegistration(siswaId: number) {
  const sessionUser = await getSessionUser();

  if (!sessionUser || sessionUser.role !== "admin") {
    throw new Error("Unauthorized");
  }

  const supabase = getServerSupabaseClient();

  const { error } = await supabase
    .from("siswa")
    .update({ status_keanggotaan: "aktif" } as never)
    .eq("id_siswa", siswaId);

  if (error) {
    throw new Error(`Failed to approve siswa: ${error.message}`);
  }

  revalidatePath("/admin");
  revalidatePath("/admin/anggota");
}

function normalizeSiswaStatus(value: string) {
  const allowedStatuses = ["aktif", "nonaktif", "menunggu_verifikasi"];

  return allowedStatuses.includes(value) ? value : "menunggu_verifikasi";
}

function isForeignKeyConstraintError(error: { code?: string; message?: string }) {
  return (
    error.code === "23503" ||
    Boolean(error.message?.includes("violates foreign key constraint"))
  );
}

async function validateUniqueSiswaFields({
  nama,
  nisn,
  username,
  email,
  currentSiswaId,
}: {
  nama: string;
  nisn: string;
  username: string;
  email: string;
  currentSiswaId?: number;
}) {
  const supabase = getServerSupabaseClient();

  const [nameCheck, nisnCheck, usernameCheck, emailCheck] = await Promise.all([
    supabase
      .from("siswa")
      .select("id_siswa")
      .ilike("nama", nama)
      .limit(1)
      .maybeSingle<{ id_siswa: number }>(),
    supabase
      .from("siswa")
      .select("id_siswa")
      .eq("nisn", nisn)
      .limit(1)
      .maybeSingle<{ id_siswa: number }>(),
    supabase
      .from("siswa")
      .select("id_siswa")
      .eq("username", username)
      .limit(1)
      .maybeSingle<{ id_siswa: number }>(),
    supabase
      .from("siswa")
      .select("id_siswa")
      .eq("email", email)
      .limit(1)
      .maybeSingle<{ id_siswa: number }>(),
  ]);

  if (nameCheck.error) {
    throw new Error(`Gagal memvalidasi nama lengkap: ${nameCheck.error.message}`);
  }

  if (nisnCheck.error) {
    throw new Error(`Gagal memvalidasi NISN: ${nisnCheck.error.message}`);
  }

  if (usernameCheck.error) {
    throw new Error(`Gagal memvalidasi username: ${usernameCheck.error.message}`);
  }

  if (emailCheck.error) {
    throw new Error(`Gagal memvalidasi email: ${emailCheck.error.message}`);
  }

  if (nameCheck.data && nameCheck.data.id_siswa !== currentSiswaId) {
    return "Nama lengkap sudah digunakan.";
  }

  if (nisnCheck.data && nisnCheck.data.id_siswa !== currentSiswaId) {
    return "NISN sudah terdaftar.";
  }

  if (usernameCheck.data && usernameCheck.data.id_siswa !== currentSiswaId) {
    return "Username sudah digunakan.";
  }

  if (emailCheck.data && emailCheck.data.id_siswa !== currentSiswaId) {
    return "Email sudah digunakan.";
  }

  return null;
}

export async function createSiswaByAdmin(
  _prevState: SiswaAdminActionState | undefined,
  formData: FormData
) {
  const sessionUser = await getSessionUser();

  if (!sessionUser || sessionUser.role !== "admin") {
    return {
      error: "Sesi admin tidak ditemukan.",
      success: "",
    };
  }

  const nama = String(formData.get("nama") ?? "").trim();
  const nisn = String(formData.get("nisn") ?? "").trim();
  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const kelas = String(formData.get("kelas") ?? "").trim();
  const tahunMasuk = String(formData.get("tahun_masuk") ?? "").trim();
  const nomorWhatsapp = String(formData.get("nomor_whatsapp") ?? "").trim();
  const statusKeanggotaan = normalizeSiswaStatus(
    String(formData.get("status_keanggotaan") ?? "")
  );

  if (
    !nama ||
    !nisn ||
    !username ||
    !email ||
    !kelas ||
    !tahunMasuk ||
    !nomorWhatsapp
  ) {
    return {
      error: "Semua data siswa wajib diisi.",
      success: "",
    };
  }

  const parsedTahunMasuk = Number(tahunMasuk);

  if (!Number.isInteger(parsedTahunMasuk) || parsedTahunMasuk < 1900) {
    return {
      error: "Tahun masuk tidak valid.",
      success: "",
    };
  }

  try {
    const duplicateMessage = await validateUniqueSiswaFields({
      nama,
      nisn,
      username,
      email,
    });

    if (duplicateMessage) {
      return {
        error: duplicateMessage,
        success: "",
      };
    }

    const supabase = getServerSupabaseClient();
    const { error } = await supabase.from("siswa").insert({
      nama,
      nisn,
      username,
      email,
      kelas,
      tahun_masuk: parsedTahunMasuk,
      nomor_whatsapp: nomorWhatsapp,
      status_keanggotaan: statusKeanggotaan,
      password: null,
    } as never);

    if (error) {
      return {
        error: `Gagal menambah siswa: ${error.message}`,
        success: "",
      };
    }

    revalidatePath("/admin/anggota");

    return {
      error: "",
      success: "Data siswa berhasil ditambahkan.",
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Terjadi kesalahan saat menambah siswa.",
      success: "",
    };
  }
}

export async function updateSiswaByAdmin(
  _prevState: SiswaAdminActionState | undefined,
  formData: FormData
) {
  const sessionUser = await getSessionUser();

  if (!sessionUser || sessionUser.role !== "admin") {
    return {
      error: "Sesi admin tidak ditemukan.",
      success: "",
    };
  }

  const siswaId = Number(formData.get("id_siswa"));
  const nama = String(formData.get("nama") ?? "").trim();
  const nisn = String(formData.get("nisn") ?? "").trim();
  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const kelas = String(formData.get("kelas") ?? "").trim();
  const tahunMasuk = String(formData.get("tahun_masuk") ?? "").trim();
  const nomorWhatsapp = String(formData.get("nomor_whatsapp") ?? "").trim();
  const statusKeanggotaan = normalizeSiswaStatus(
    String(formData.get("status_keanggotaan") ?? "")
  );

  if (!Number.isInteger(siswaId) || siswaId < 1) {
    return {
      error: "Siswa yang dipilih tidak valid.",
      success: "",
    };
  }

  if (
    !nama ||
    !nisn ||
    !username ||
    !email ||
    !kelas ||
    !tahunMasuk ||
    !nomorWhatsapp
  ) {
    return {
      error: "Semua data siswa wajib diisi.",
      success: "",
    };
  }

  const parsedTahunMasuk = Number(tahunMasuk);

  if (!Number.isInteger(parsedTahunMasuk) || parsedTahunMasuk < 1900) {
    return {
      error: "Tahun masuk tidak valid.",
      success: "",
    };
  }

  try {
    const duplicateMessage = await validateUniqueSiswaFields({
      nama,
      nisn,
      username,
      email,
      currentSiswaId: siswaId,
    });

    if (duplicateMessage) {
      return {
        error: duplicateMessage,
        success: "",
      };
    }

    const supabase = getServerSupabaseClient();
    const { error } = await supabase
      .from("siswa")
      .update({
        nama,
        nisn,
        username,
        email,
        kelas,
        tahun_masuk: parsedTahunMasuk,
        nomor_whatsapp: nomorWhatsapp,
        status_keanggotaan: statusKeanggotaan,
      } as never)
      .eq("id_siswa", siswaId);

    if (error) {
      return {
        error: `Gagal memperbarui siswa: ${error.message}`,
        success: "",
      };
    }

    revalidatePath("/admin/anggota");

    return {
      error: "",
      success: "Data siswa berhasil diperbarui.",
      siswa: {
        id_siswa: siswaId,
        nama,
        nisn,
        username,
        email,
        kelas,
        tahun_masuk: parsedTahunMasuk,
        nomor_whatsapp: nomorWhatsapp,
        status_keanggotaan: statusKeanggotaan,
      },
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Terjadi kesalahan saat memperbarui siswa.",
      success: "",
    };
  }
}

export async function rejectSiswaRegistration(siswaId: number) {
  const sessionUser = await getSessionUser();

  if (!sessionUser || sessionUser.role !== "admin") {
    throw new Error("Unauthorized");
  }

  const supabase = getServerSupabaseClient();
  const { error } = await supabase
    .from("siswa")
    .delete()
    .eq("id_siswa", siswaId);

  if (error) {
    throw new Error(`Failed to reject siswa: ${error.message}`);
  }

  revalidatePath("/admin/anggota");
}

export async function deleteSiswaByAdmin(
  siswaId: number
): Promise<DeleteSiswaActionState> {
  const sessionUser = await getSessionUser();

  if (!sessionUser || sessionUser.role !== "admin") {
    throw new Error("Unauthorized");
  }

  const supabase = getServerSupabaseClient();
  const { error } = await supabase.from("siswa").delete().eq("id_siswa", siswaId);

  if (error) {
    if (isForeignKeyConstraintError(error)) {
      return {
        error:
          "Siswa terikat dengan transaksi dan tidak dapat dihapus dari database.",
        deleted: false,
        blockedByTransactions: true,
      };
    }

    return {
      error: `Failed to delete siswa: ${error.message}`,
      deleted: false,
      blockedByTransactions: false,
    };
  }

  revalidatePath("/admin/anggota");

  return {
    error: "",
    deleted: true,
    blockedByTransactions: false,
  };
}

export async function deactivateSiswaByAdmin(siswaId: number) {
  const sessionUser = await getSessionUser();

  if (!sessionUser || sessionUser.role !== "admin") {
    throw new Error("Unauthorized");
  }

  const supabase = getServerSupabaseClient();
  const { error } = await supabase
    .from("siswa")
    .update({ status_keanggotaan: "nonaktif" } as never)
    .eq("id_siswa", siswaId);

  if (error) {
    throw new Error(`Failed to deactivate siswa: ${error.message}`);
  }

  revalidatePath("/admin/anggota");
}

export async function updateSiswaPassword(siswaId: number, formData: FormData) {
  const sessionUser = await getSessionUser();

  if (!sessionUser || sessionUser.role !== "admin") {
    throw new Error("Unauthorized");
  }

  const newPassword = String(formData.get("new_password") ?? "");

  if (newPassword.length < 8) {
    throw new Error("Password baru minimal 8 karakter.");
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  const supabase = getServerSupabaseClient();

  const { error } = await supabase
    .from("siswa")
    .update({ password: passwordHash } as never)
    .eq("id_siswa", siswaId);

  if (error) {
    throw new Error(`Failed to update siswa password: ${error.message}`);
  }

  revalidatePath("/admin");
}

export async function clearSiswaPassword(siswaId: number) {
  const sessionUser = await getSessionUser();

  if (!sessionUser || sessionUser.role !== "admin") {
    throw new Error("Unauthorized");
  }

  const supabase = getServerSupabaseClient();

  const { error } = await supabase
    .from("siswa")
    .update({ password: null } as never)
    .eq("id_siswa", siswaId);

  if (error) {
    throw new Error(`Failed to clear siswa password: ${error.message}`);
  }

  revalidatePath("/admin/anggota");
}

export async function resetSiswaPassword(
  _prevState: PasswordResetState | undefined,
  formData: FormData
) {
  const identifier = String(formData.get("identifier") ?? "").trim();
  const currentPassword = String(formData.get("current_password") ?? "");
  const newPassword = String(formData.get("new_password") ?? "");
  const confirmPassword = String(formData.get("confirm_password") ?? "");

  if (!identifier || !newPassword || !confirmPassword) {
    return {
      error: "Identifier, password baru, dan konfirmasi password wajib diisi.",
      success: "",
    };
  }

  if (newPassword.length < 8) {
    return {
      error: "Password baru minimal 8 karakter.",
      success: "",
    };
  }

  if (newPassword !== confirmPassword) {
    return {
      error: "Konfirmasi password baru belum sama.",
      success: "",
    };
  }

  try {
    const siswa = await findSiswaAccountByIdentifier(identifier);

    if (!siswa) {
      return {
        error: "Akun siswa tidak ditemukan.",
        success: "",
      };
    }

    if (siswa.status_keanggotaan !== "aktif") {
      return {
        error:
          "Akun siswa belum aktif. Hubungi admin perpustakaan untuk verifikasi akun.",
        success: "",
      };
    }

    if (siswa.password) {
      const isCurrentPasswordValid = await bcrypt.compare(
        currentPassword,
        siswa.password
      );

      if (!currentPassword || !isCurrentPasswordValid) {
        return {
          error:
            "Password lama wajib benar. Jika lupa, minta admin perpustakaan mengosongkan password akunmu terlebih dahulu.",
          success: "",
        };
      }
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    const supabase = getServerSupabaseClient();

    const { error } = await supabase
      .from("siswa")
      .update({ password: passwordHash } as never)
      .eq("id_siswa", siswa.id_siswa);

    if (error) {
      throw new Error(`Failed to reset siswa password: ${error.message}`);
    }

    return {
      error: "",
      success:
        "Password berhasil diperbarui. Silakan kembali ke halaman login dan masuk dengan password baru.",
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Terjadi kesalahan saat memperbarui password.";

    return {
      error: message,
      success: "",
    };
  }
}

export async function updateOwnSiswaProfile(
  _prevState: UpdateSiswaProfileState | undefined,
  formData: FormData
) {
  const sessionUser = await getSessionUser();

  if (!sessionUser || sessionUser.role !== "siswa") {
    return {
      error: "Sesi siswa tidak ditemukan.",
      success: "",
    };
  }

  const username = String(formData.get("username") ?? "")
    .trim()
    .toLowerCase();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const kelas = String(formData.get("kelas") ?? "").trim();
  const nomorWhatsapp = String(formData.get("nomor_whatsapp") ?? "").trim();

  if (!username || !email || !kelas || !nomorWhatsapp) {
    return {
      error: "Semua data profil wajib diisi.",
      success: "",
    };
  }

  const supabase = getServerSupabaseClient();

  const currentSiswaResult = await supabase
    .from("siswa")
    .select("nama, tahun_masuk")
    .eq("id_siswa", sessionUser.id)
    .limit(1)
    .maybeSingle<{ nama: string; tahun_masuk: number | null }>();

  if (currentSiswaResult.error) {
    return {
      error: `Gagal membaca profil siswa: ${currentSiswaResult.error.message}`,
      success: "",
    };
  }

  if (!currentSiswaResult.data) {
    return {
      error: "Data profil siswa tidak ditemukan.",
      success: "",
    };
  }

  const nama = currentSiswaResult.data.nama;
  const tahunMasuk =
    currentSiswaResult.data.tahun_masuk === null
      ? ""
      : String(currentSiswaResult.data.tahun_masuk);

  const [usernameCheck, emailCheck] = await Promise.all([
    supabase
      .from("siswa")
      .select("id_siswa")
      .eq("username", username)
      .neq("id_siswa", sessionUser.id)
      .limit(1)
      .maybeSingle(),
    supabase
      .from("siswa")
      .select("id_siswa")
      .eq("email", email)
      .neq("id_siswa", sessionUser.id)
      .limit(1)
      .maybeSingle(),
  ]);

  if (usernameCheck.error) {
    return {
      error: `Gagal memvalidasi username: ${usernameCheck.error.message}`,
      success: "",
    };
  }

  if (emailCheck.error) {
    return {
      error: `Gagal memvalidasi email: ${emailCheck.error.message}`,
      success: "",
    };
  }

  if (usernameCheck.data) {
    return {
      error: "Username sudah digunakan oleh akun siswa lain.",
      success: "",
    };
  }

  if (emailCheck.data) {
    return {
      error: "Email sudah digunakan oleh akun siswa lain.",
      success: "",
    };
  }

  const { error } = await supabase
    .from("siswa")
    .update({
      nama,
      username,
      email,
      kelas,
      nomor_whatsapp: nomorWhatsapp,
    } as never)
    .eq("id_siswa", sessionUser.id);

  if (error) {
    return {
      error: `Gagal memperbarui profil siswa: ${error.message}`,
      success: "",
    };
  }

  await createSession({
    ...sessionUser,
    name: nama,
    identifier: username || email || nama,
    className: kelas,
  });

  revalidatePath("/siswa");
  revalidatePath("/siswa/profil");

  return {
    error: "",
    success: "Profil siswa berhasil diperbarui.",
    profile: {
      nama,
      username,
      email,
      kelas,
      tahunMasuk,
      nomorWhatsapp,
    },
  };
}

function normalizeUsername(value: FormDataEntryValue | null) {
  return String(value ?? "").trim().toLowerCase();
}

function isSuperAdmin(sessionUser: SessionUser | null): sessionUser is SessionUser {
  return Boolean(sessionUser && sessionUser.role === "admin" && sessionUser.id === 0);
}

async function getAdminSchemaSupport(adminId: number) {
  const supabase = getServerSupabaseClient();
  const { data, error } = await supabase
    .from("admin")
    .select("*")
    .eq("id_admin", adminId)
    .limit(1)
    .maybeSingle<Record<string, unknown>>();

  if (error) {
    throw new Error(`Gagal membaca schema admin: ${error.message}`);
  }

  return {
    supportsEmail: Boolean(
      data && Object.prototype.hasOwnProperty.call(data, "email")
    ),
    telephoneColumn:
      data && Object.prototype.hasOwnProperty.call(data, "nomor_telephone")
        ? "nomor_telephone"
        : data && Object.prototype.hasOwnProperty.call(data, "nomor_telepon")
          ? "nomor_telepon"
          : null,
  };
}

export async function updateOwnAdminProfile(
  _prevState: AdminProfileState | undefined,
  formData: FormData
) {
  const sessionUser = await getSessionUser();

  if (!isSuperAdmin(sessionUser)) {
    return {
      error: "Hanya superadmin yang boleh mengedit data admin.",
      success: "",
    };
  }

  const nama = String(formData.get("nama") ?? "").trim();
  const username = normalizeUsername(formData.get("username"));
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const nomorTelephone = String(formData.get("nomor_telephone") ?? "").trim();

  if (!nama || !username) {
    return {
      error: "Nama lengkap dan username wajib diisi.",
      success: "",
    };
  }

  const supabase = getServerSupabaseClient();

  try {
    const usernameCheck = await supabase
      .from("admin")
      .select("id_admin")
      .eq("username", username)
      .neq("id_admin", sessionUser.id)
      .limit(1)
      .maybeSingle();

    if (usernameCheck.error) {
      return {
        error: `Gagal memvalidasi username: ${usernameCheck.error.message}`,
        success: "",
      };
    }

    if (usernameCheck.data) {
      return {
        error: "Username sudah digunakan oleh admin lain.",
        success: "",
      };
    }

    const schema = await getAdminSchemaSupport(sessionUser.id);
    const payload: Record<string, string> = { nama, username };

    if (schema.supportsEmail) {
      payload.email = email;
    }

    if (schema.telephoneColumn) {
      payload[schema.telephoneColumn] = nomorTelephone;
    }

    const { error } = await supabase
      .from("admin")
      .update(payload as never)
      .eq("id_admin", sessionUser.id);

    if (error) {
      return {
        error: `Gagal memperbarui profil admin: ${error.message}`,
        success: "",
      };
    }

    await createSession({
      ...sessionUser,
      name: nama,
      identifier: username || nama,
    });

    revalidatePath("/admin");
    revalidatePath("/admin/profil");

    return {
      error: "",
      success: "Profil admin berhasil diperbarui.",
      profile: {
        id: sessionUser.id,
        nama,
        username,
        email: schema.supportsEmail ? email : "",
        nomorTelephone: schema.telephoneColumn ? nomorTelephone : "",
        supportsEmail: schema.supportsEmail,
        supportsNomorTelephone: Boolean(schema.telephoneColumn),
      },
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Terjadi kesalahan saat memperbarui profil admin.";

    return {
      error: message,
      success: "",
    };
  }
}

export async function updateAdminAccount(
  _prevState: AdminProfileState | undefined,
  formData: FormData
) {
  const sessionUser = await getSessionUser();

  if (!isSuperAdmin(sessionUser)) {
    return {
      error: "Hanya superadmin yang boleh mengedit data admin.",
      success: "",
    };
  }

  const adminId = Number(formData.get("admin_id"));
  const nama = String(formData.get("nama") ?? "").trim();
  const username = normalizeUsername(formData.get("username"));
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const nomorTelephone = String(formData.get("nomor_telephone") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!Number.isInteger(adminId) || adminId < 0) {
    return {
      error: "Admin yang dipilih tidak valid.",
      success: "",
    };
  }

  if (!nama || !username) {
    return {
      error: "Nama lengkap dan username wajib diisi.",
      success: "",
    };
  }

  if (password && password.length < 8) {
    return {
      error: "Password baru minimal 8 karakter.",
      success: "",
    };
  }

  const supabase = getServerSupabaseClient();

  try {
    const usernameCheck = await supabase
      .from("admin")
      .select("id_admin")
      .eq("username", username)
      .neq("id_admin", adminId)
      .limit(1)
      .maybeSingle();

    if (usernameCheck.error) {
      return {
        error: `Gagal memvalidasi username: ${usernameCheck.error.message}`,
        success: "",
      };
    }

    if (usernameCheck.data) {
      return {
        error: "Username sudah digunakan oleh admin lain.",
        success: "",
      };
    }

    const schema = await getAdminSchemaSupport(sessionUser.id);
    const payload: Record<string, string> = { nama, username };

    if (schema.supportsEmail) {
      payload.email = email;
    }

    if (schema.telephoneColumn) {
      payload[schema.telephoneColumn] = nomorTelephone;
    }

    if (password) {
      payload.password = await bcrypt.hash(password, 10);
    }

    const { error } = await supabase
      .from("admin")
      .update(payload as never)
      .eq("id_admin", adminId);

    if (error) {
      return {
        error: `Gagal memperbarui data admin: ${error.message}`,
        success: "",
      };
    }

    if (adminId === sessionUser.id) {
      await createSession({
        ...sessionUser,
        name: nama,
        identifier: username || nama,
      });
    }

    revalidatePath("/admin/profil");

    return {
      error: "",
      success: "Data admin berhasil diperbarui.",
      profile: {
        id: adminId,
        nama,
        username,
        email: schema.supportsEmail ? email : "",
        nomorTelephone: schema.telephoneColumn ? nomorTelephone : "",
        supportsEmail: schema.supportsEmail,
        supportsNomorTelephone: Boolean(schema.telephoneColumn),
      },
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Terjadi kesalahan saat memperbarui data admin.";

    return {
      error: message,
      success: "",
    };
  }
}

export async function createAdminAccount(
  _prevState: AdminProfileState | undefined,
  formData: FormData
) {
  const sessionUser = await getSessionUser();

  if (!isSuperAdmin(sessionUser)) {
    return {
      error: "Hanya superadmin yang boleh menambah admin.",
      success: "",
    };
  }

  const nama = String(formData.get("nama") ?? "").trim();
  const username = normalizeUsername(formData.get("username"));
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const nomorTelephone = String(formData.get("nomor_telephone") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!nama || !username || !password) {
    return {
      error: "Nama lengkap, username, dan password wajib diisi.",
      success: "",
    };
  }

  if (password.length < 8) {
    return {
      error: "Password admin baru minimal 8 karakter.",
      success: "",
    };
  }

  const supabase = getServerSupabaseClient();

  try {
    const usernameCheck = await supabase
      .from("admin")
      .select("id_admin")
      .eq("username", username)
      .limit(1)
      .maybeSingle();

    if (usernameCheck.error) {
      return {
        error: `Gagal memvalidasi username: ${usernameCheck.error.message}`,
        success: "",
      };
    }

    if (usernameCheck.data) {
      return {
        error: "Username sudah digunakan oleh admin lain.",
        success: "",
      };
    }

    const schema = await getAdminSchemaSupport(sessionUser.id);
    const passwordHash = await bcrypt.hash(password, 10);
    const payload: Record<string, string> = {
      nama,
      username,
      password: passwordHash,
    };

    if (schema.supportsEmail) {
      payload.email = email;
    }

    if (schema.telephoneColumn) {
      payload[schema.telephoneColumn] = nomorTelephone;
    }

    const { error } = await supabase.from("admin").insert(payload as never);

    if (error) {
      return {
        error: `Gagal membuat akun admin: ${error.message}`,
        success: "",
      };
    }

    revalidatePath("/admin/profil");

    return {
      error: "",
      success: "Akun admin baru berhasil dibuat.",
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Terjadi kesalahan saat membuat akun admin.";

    return {
      error: message,
      success: "",
    };
  }
}

export async function deleteAdminAccount(
  _prevState: AdminProfileState | undefined,
  formData: FormData
) {
  const sessionUser = await getSessionUser();

  if (!isSuperAdmin(sessionUser)) {
    return {
      error: "Hanya superadmin yang boleh menghapus admin.",
      success: "",
    };
  }

  const adminId = Number(formData.get("admin_id"));

  if (!Number.isInteger(adminId) || adminId < 0) {
    return {
      error: "Admin yang dipilih tidak valid.",
      success: "",
    };
  }

  if (adminId === 0) {
    return {
      error: "Akun superadmin tidak boleh dihapus.",
      success: "",
    };
  }

  const supabase = getServerSupabaseClient();
  const { error } = await supabase.from("admin").delete().eq("id_admin", adminId);

  if (error) {
    return {
      error: `Gagal menghapus admin: ${error.message}`,
      success: "",
    };
  }

  revalidatePath("/admin/profil");

  return {
    error: "",
    success: "Akun admin berhasil dihapus.",
  };
}

export async function loginAsPublic(
  _prevState: PublicSessionPasswordState | undefined,
  formData: FormData
) {
  const password = String(formData.get("public_password") ?? "");

  if (!password) {
    return {
      error: "Password publik wajib diisi.",
      success: "",
    };
  }

  try {
    const isPasswordValid = await verifyPublicSessionPassword(password);

    if (!isPasswordValid) {
      return {
        error: "Password publik tidak sesuai.",
        success: "",
      };
    }
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Gagal memverifikasi password publik.",
      success: "",
    };
  }

  await createSession({
    id: 0,
    role: "public",
    name: "Monitor Publik",
    identifier: "public",
  });

  redirect("/public");
}

export async function changePublicSessionPassword(
  _prevState: PublicSessionPasswordState | undefined,
  formData: FormData
) {
  const sessionUser = await getSessionUser();

  if (!sessionUser || sessionUser.role !== "admin") {
    return {
      error: "Sesi admin tidak ditemukan.",
      success: "",
    };
  }

  const newPassword = String(formData.get("new_public_password") ?? "");
  const confirmPassword = String(formData.get("confirm_public_password") ?? "");

  if (!newPassword || !confirmPassword) {
    return {
      error: "Password baru dan konfirmasi password wajib diisi.",
      success: "",
    };
  }

  if (newPassword.length < 6) {
    return {
      error: "Password publik minimal 6 karakter.",
      success: "",
    };
  }

  if (newPassword !== confirmPassword) {
    return {
      error: "Konfirmasi password publik belum sama.",
      success: "",
    };
  }

  try {
    await updatePublicSessionPassword({
      password: newPassword,
      adminId: sessionUser.id,
    });

    revalidatePath("/admin");

    return {
      error: "",
      success: "Password mode publik berhasil diperbarui.",
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Gagal memperbarui password mode publik.",
      success: "",
    };
  }
}

export async function logoutUser(
  _prevState: LogoutState | undefined,
  formData: FormData
) {
  const sessionUser = await getSessionUser();

  if (sessionUser?.role === "public") {
    const password = String(formData.get("public_password") ?? "");

    if (!password) {
      return {
        error: "Password publik wajib diisi untuk keluar.",
      };
    }

    try {
      const isPasswordValid = await verifyPublicSessionPassword(password);

      if (!isPasswordValid) {
        return {
          error: "Password publik tidak sesuai.",
        };
      }
    } catch (error) {
      return {
        error:
          error instanceof Error
            ? error.message
            : "Gagal memverifikasi password publik.",
      };
    }
  }

  await clearSession();
  redirect("/");
}
