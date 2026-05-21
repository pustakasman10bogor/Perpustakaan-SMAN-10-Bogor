"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { signupSiswa, type SignupFormState } from "@/app/actions/auth";
import { PasswordInput } from "@/modules/access/ui/password-input";

const initialState: SignupFormState = {
  error: "",
  success: "",
  returnTo: "",
};

type SignupFields = {
  nama: string;
  nisn: string;
  username: string;
  email: string;
  kelas: string;
  tahun_masuk: string;
  nomor_whatsapp: string;
  password: string;
  confirm_password: string;
};

const initialFields: SignupFields = {
  nama: "",
  nisn: "",
  username: "",
  email: "",
  kelas: "",
  tahun_masuk: "",
  nomor_whatsapp: "",
  password: "",
  confirm_password: "",
};

export function SignupForm({
  returnHref = "/",
  returnLabel = "Kembali ke halaman login",
}: {
  returnHref?: string;
  returnLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(signupSiswa, initialState);
  const [fields, setFields] = useState<SignupFields>(initialFields);
  const successReturnHref = state?.returnTo || returnHref;
  const successReturnsToPublicAttendance = successReturnHref === "/public/absensi";
  const successReturnLabel = successReturnsToPublicAttendance
    ? "Kembali ke absensi publik"
    : returnLabel;

  function updateField(field: keyof SignupFields, value: string) {
    setFields((currentFields) => ({
      ...currentFields,
      [field]: value,
    }));
  }

  if (state?.success) {
    return (
      <div className="w-full rounded-[1.75rem] border border-emerald-200 bg-white/95 p-4 shadow-sm sm:p-6">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-700">
            Pendaftaran Terkirim
          </p>
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-950">
            Akun menunggu verifikasi
          </h2>
          <p className="text-sm leading-6 text-zinc-600">
            Akun siswa berhasil didaftarkan. Kamu perlu menunggu verifikasi dari
            admin perpustakaan sebelum akun dapat digunakan untuk login.
          </p>
        </div>

        {successReturnsToPublicAttendance ? (
          <div className="mt-6 break-words rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-800">
            Kamu sudah bisa kembali ke absensi publik dan memilih nama yang baru
            didaftarkan. Login siswa tetap menunggu persetujuan admin.
          </div>
        ) : (
          <div className="mt-6 break-words rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-800">
            Setelah admin menyetujui pendaftaran, masuk kembali melalui halaman
            login dengan username atau email yang sudah didaftarkan.
          </div>
        )}

        <Link
          href={successReturnHref}
          className="mt-6 inline-flex min-h-[44px] w-full items-center justify-center rounded-2xl bg-[#145da0] px-5 py-3 text-sm font-medium text-white transition hover:bg-[#0f4f8a]"
        >
          {successReturnLabel}
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full rounded-[1.75rem] border border-white/70 bg-white/95 p-4 shadow-sm sm:p-6">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#145da0]">
          Registrasi Siswa
        </p>
        <h2 className="text-2xl font-semibold tracking-tight text-zinc-950">
          Buat akun siswa baru
        </h2>
        <p className="text-sm leading-6 text-zinc-600">
          Akun baru akan berstatus <span className="font-medium">menunggu_verifikasi</span>
          {" "}sampai disetujui admin perpustakaan.
        </p>
      </div>

      <form action={formAction} className="mt-6 grid gap-4 md:grid-cols-2">
        <input type="hidden" name="return_to" value={returnHref} />
        <Field
          id="nama"
          label="Nama lengkap"
          value={fields.nama}
          onChange={(value) => updateField("nama", value)}
        />
        <Field
          id="nisn"
          label="NISN"
          value={fields.nisn}
          onChange={(value) => updateField("nisn", value)}
        />
        <Field
          id="username"
          label="Username"
          value={fields.username}
          onChange={(value) => updateField("username", value)}
        />
        <Field
          id="email"
          label="Email"
          type="email"
          value={fields.email}
          onChange={(value) => updateField("email", value)}
        />
        <Field
          id="kelas"
          label="Kelas"
          value={fields.kelas}
          onChange={(value) => updateField("kelas", value)}
        />
        <Field
          id="tahun_masuk"
          label="Tahun masuk"
          type="number"
          value={fields.tahun_masuk}
          onChange={(value) => updateField("tahun_masuk", value)}
        />
        <Field
          id="nomor_whatsapp"
          label="Nomor WhatsApp"
          value={fields.nomor_whatsapp}
          onChange={(value) => updateField("nomor_whatsapp", value)}
          className="md:col-span-2"
        />
        <PasswordInput
          id="password"
          label="Password"
          value={fields.password}
          onChange={(value) => updateField("password", value)}
          minLength={8}
          required
          inputClassName="min-h-[44px] w-full rounded-2xl border border-zinc-300 bg-zinc-50 px-4 py-3 pr-12 text-zinc-950 outline-none transition focus:border-[#145da0]"
        />
        <PasswordInput
          id="confirm_password"
          label="Konfirmasi password"
          value={fields.confirm_password}
          onChange={(value) => updateField("confirm_password", value)}
          minLength={8}
          required
          inputClassName="min-h-[44px] w-full rounded-2xl border border-zinc-300 bg-zinc-50 px-4 py-3 pr-12 text-zinc-950 outline-none transition focus:border-[#145da0]"
        />

        <div className="md:col-span-2">
          {state?.error ? (
            <p className="break-words rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {state.error}
            </p>
          ) : null}

          {state?.success ? (
            <p className="break-words rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {state.success}
            </p>
          ) : null}
        </div>

        <div className="md:col-span-2">
          <button
            type="submit"
            disabled={pending}
            className="inline-flex min-h-[44px] w-full items-center justify-center rounded-2xl bg-[#145da0] px-5 py-3 text-sm font-medium text-white transition hover:bg-[#0f4f8a] disabled:cursor-not-allowed disabled:bg-zinc-400"
          >
            {pending ? "Mengirim pendaftaran..." : "Daftarkan akun siswa"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
  className = "",
}: {
  id: keyof SignupFields;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  className?: string;
}) {
  return (
    <div className={`min-w-0 space-y-2 ${className}`}>
      <label htmlFor={id} className="text-sm font-medium text-zinc-800">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required
        className="min-h-[44px] w-full rounded-2xl border border-zinc-300 bg-zinc-50 px-4 py-3 text-zinc-950 outline-none transition focus:border-[#145da0]"
      />
    </div>
  );
}
