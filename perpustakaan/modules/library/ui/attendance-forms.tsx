"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import {
  submitPublicAttendance,
  submitSiswaAttendance,
  type AttendanceState,
} from "@/app/actions/attendance";
import type { StudentSuggestion } from "@/modules/library/lib/data";
import {
  ButtonLoadingSpinner,
  useButtonPressLoading,
} from "@/modules/shared/ui/button-loading";

const initialState: AttendanceState = {
  error: "",
  success: "",
};

const visitorTypes = ["siswa", "umum"] as const;
type VisitorType = (typeof visitorTypes)[number];
const publicAttendanceSignupHref = "/signup?next=/public/absensi";

function normalizeStudentText(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function studentDisplayName(student: StudentSuggestion) {
  return [
    student.nama,
    student.nisn ? `NIS ${student.nisn}` : "",
    student.kelas ?? "",
  ]
    .filter(Boolean)
    .join(" - ");
}

export function PublicAttendanceForm({
  studentNameSuggestions,
}: {
  studentNameSuggestions: StudentSuggestion[];
}) {
  const [visitorType, setVisitorType] = useState<VisitorType | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);
  const [nameInput, setNameInput] = useState("");
  const [kelasInput, setKelasInput] = useState("");
  const [tujuanInput, setTujuanInput] = useState("");
  const [hideSuccessNotice, setHideSuccessNotice] = useState(false);
  const [state, formAction, pending] = useActionState(
    submitPublicAttendance,
    initialState
  );
  const { loadingKey: loadingVisitorType, startLoading: startVisitorTypeLoading } =
    useButtonPressLoading<VisitorType>();
  const wasPendingRef = useRef(false);

  function resetFormFields() {
    setVisitorType(null);
    setSelectedStudentId(null);
    setNameInput("");
    setKelasInput("");
    setTujuanInput("");
  }

  useEffect(() => {
    if (pending) {
      wasPendingRef.current = true;
      return;
    }

    if (wasPendingRef.current) {
      const timeoutId = window.setTimeout(() => {
        if (state?.success) {
          resetFormFields();
          setHideSuccessNotice(false);
        }
      }, 0);

      wasPendingRef.current = false;

      return () => window.clearTimeout(timeoutId);
    }
  }, [pending, state?.success]);

  const studentLookupByName = useMemo(() => {
    const map = new Map<string, StudentSuggestion>();

    studentNameSuggestions.forEach((student) => {
      [
        normalizeStudentText(student.nama),
        normalizeStudentText(studentDisplayName(student)),
        student.nisn ? normalizeStudentText(student.nisn) : "",
      ]
        .filter(Boolean)
        .forEach((key) => {
          if (!map.has(key)) {
            map.set(key, student);
          }
        });
    });

    return map;
  }, [studentNameSuggestions]);

  const selectedStudent = useMemo(() => {
    if (selectedStudentId === null) {
      return null;
    }

    return (
      studentNameSuggestions.find((student) => student.id_siswa === selectedStudentId) ??
      null
    );
  }, [selectedStudentId, studentNameSuggestions]);

  const filteredStudents = useMemo(() => {
    if (visitorType !== "siswa") {
      return [];
    }

    const query = nameInput.trim().toLowerCase();

    if (!query) {
      return studentNameSuggestions;
    }

    return studentNameSuggestions.filter((student) =>
      [student.nama, student.nisn, student.kelas]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [nameInput, studentNameSuggestions, visitorType]);

  const asalLabel = useMemo(() => {
    if (visitorType === "siswa") {
      return "Kelas";
    }

    if (visitorType === "umum") {
      return "Asal instansi";
    }

    return "Kelas / Asal instansi";
  }, [visitorType]);

  const asalPlaceholder = useMemo(() => {
    if (visitorType === "siswa") {
      return "Kelas terisi otomatis dari database";
    }

    if (visitorType === "umum") {
      return "Nama sekolah, instansi, atau asal pengunjung";
    }

    return "Pilih jenis pengunjung terlebih dahulu";
  }, [visitorType]);

  const formLocked = visitorType === null;

  function handleVisitorTypeChange(nextType: VisitorType) {
    startVisitorTypeLoading(nextType);
    setHideSuccessNotice(true);
    setVisitorType(nextType);
    setSelectedStudentId(null);
    setNameInput("");
    setKelasInput("");
    setTujuanInput("");
  }

  function handleNameChange(value: string) {
    setNameInput(value);

    if (visitorType !== "siswa") {
      return;
    }

    const matched = studentLookupByName.get(normalizeStudentText(value));

    if (matched) {
      setSelectedStudentId(matched.id_siswa);
      setKelasInput(matched.kelas ?? "-");
      return;
    }

    setSelectedStudentId(null);
    setKelasInput("");
  }

  const siswaSelectionIncomplete =
    visitorType === "siswa" && (selectedStudentId === null || !kelasInput);

  const shouldShowSuggestions =
    visitorType === "siswa" &&
    nameInput.trim().length > 0 &&
    (!selectedStudent ||
      normalizeStudentText(nameInput) !== normalizeStudentText(selectedStudent.nama)) &&
    filteredStudents.length > 0;

  const showNotRegisteredWarning =
    visitorType === "siswa" &&
    selectedStudentId === null &&
    nameInput.trim().length > 0 &&
    filteredStudents.length === 0;

  return (
    <form action={formAction} className="w-full space-y-5">
      <div className="space-y-2">
        <p className="text-sm font-medium text-zinc-800">
          Jenis pengunjung <span className="text-red-500">*</span>
        </p>
        <input type="hidden" name="jenis_pengunjung" value={visitorType ?? ""} />
        <div className="grid w-full grid-cols-2 rounded-xl border border-zinc-300 bg-white p-1 sm:inline-grid sm:w-auto">
          {visitorTypes.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => handleVisitorTypeChange(type)}
              aria-busy={loadingVisitorType === type}
              className={`inline-flex min-h-[44px] min-w-0 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
                visitorType === type
                  ? "bg-[#1d66d6] text-white"
                  : "text-zinc-600 hover:bg-zinc-100"
              }`}
              aria-pressed={visitorType === type}
            >
              {loadingVisitorType === type ? <ButtonLoadingSpinner /> : null}
              <span className="truncate">
                {type === "siswa" ? "Siswa SMAN 10" : "Umum"}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="nama" className="text-sm font-medium text-zinc-800">
          Nama pengunjung <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <input
            id="nama"
            name="nama"
            required
            placeholder={
              visitorType === "siswa"
                ? "Cari nama, NIS, atau kelas..."
                : "Nama lengkap"
            }
            disabled={formLocked}
            value={nameInput}
            autoComplete="off"
            onChange={(event) => handleNameChange(event.currentTarget.value)}
            className="min-h-[44px] w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-[#1d66d6] disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500"
          />

          {shouldShowSuggestions ? (
            <div className="absolute z-10 mt-2 max-h-56 w-full overflow-auto rounded-xl border border-zinc-200 bg-white p-1 shadow-lg">
              {filteredStudents.slice(0, 8).map((student) => (
                <button
                  key={student.id_siswa}
                  type="button"
                  onClick={() => {
                    setNameInput(student.nama);
                    setSelectedStudentId(student.id_siswa);
                    setKelasInput(student.kelas ?? "-");
                  }}
                  className="flex min-h-[44px] w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm text-zinc-700 transition hover:bg-zinc-100"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-zinc-900">
                      {student.nama}
                    </span>
                    <span className="block truncate text-xs text-zinc-500">
                      {student.nisn ? `NIS ${student.nisn}` : "NIS -"}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-zinc-500">
                    {student.kelas ?? "-"}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {visitorType === "siswa" ? (
        <input type="hidden" name="id_siswa" value={selectedStudentId ?? ""} />
      ) : null}

      <Field
        id="asal"
        label={asalLabel}
        placeholder={asalPlaceholder}
        required
        disabled={formLocked}
        value={kelasInput}
        onChange={visitorType === "umum" ? setKelasInput : undefined}
        readOnly={visitorType === "siswa"}
      />

      <Field
        id="tujuan"
        label="Tujuan kunjungan"
        placeholder="Meminjam buku"
        required
        disabled={formLocked}
        value={tujuanInput}
        onChange={setTujuanInput}
      />

      {formLocked ? (
        <p className="break-words rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Pilih jenis pengunjung terlebih dahulu untuk mengisi form.
        </p>
      ) : null}

      {siswaSelectionIncomplete && !showNotRegisteredWarning ? (
        <div className="space-y-2 break-words rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
          <p>
            Siswa belum terdaftar? Daftar melalui{" "}
            <Link
              href={publicAttendanceSignupHref}
              className="font-semibold text-[#1d66d6] underline"
            >
              halaman pendaftaran
            </Link>{" "}
            lalu kembali ke absensi publik.
          </p>
        </div>
      ) : null}

      {showNotRegisteredWarning ? (
        <div className="space-y-2 break-words rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p>Nama siswa belum terdaftar di sistem.</p>
          <p>
            Daftar melalui{" "}
            <Link
              href={publicAttendanceSignupHref}
              className="font-semibold text-[#1d66d6] underline"
            >
              halaman pendaftaran
            </Link>{" "}
            lalu kembali ke absensi publik.
          </p>
        </div>
      ) : null}

      {state?.error ? (
        <p className="break-words rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}

      {state?.success && !hideSuccessNotice ? (
        <p className="break-words rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {state.success}
        </p>
      ) : null}

      {pending ? (
        <div className="inline-flex w-full items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm text-sky-800 sm:w-auto">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-sky-600" />
          Menyimpan absensi, mohon tunggu...
        </div>
      ) : null}

      <button
        type="submit"
        disabled={pending || formLocked || siswaSelectionIncomplete}
        className="inline-flex min-h-[44px] w-full min-w-44 items-center justify-center rounded-xl bg-[#1d66d6] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#1553b2] disabled:cursor-not-allowed disabled:bg-zinc-400 sm:w-auto"
      >
        {pending ? "Menyimpan..." : "Simpan absensi"}
      </button>
    </form>
  );
}

export function SiswaAttendanceForm({
  userName,
  className,
  alreadyAttendedToday = false,
  attendanceTime,
}: {
  userName: string;
  className: string | null;
  alreadyAttendedToday?: boolean;
  attendanceTime?: string | null;
}) {
  const [tujuanInput, setTujuanInput] = useState("Kunjungan perpustakaan siswa");
  const [hideSuccessNotice, setHideSuccessNotice] = useState(false);
  const [state, formAction, pending] = useActionState(
    submitSiswaAttendance,
    initialState
  );
  const wasPendingRef = useRef(false);

  useEffect(() => {
    if (pending) {
      wasPendingRef.current = true;
      return;
    }

    if (wasPendingRef.current) {
      const timeoutId = window.setTimeout(() => {
        if (state?.success) {
          setTujuanInput("Kunjungan perpustakaan siswa");
          setHideSuccessNotice(false);
        }
      }, 0);

      wasPendingRef.current = false;

      return () => window.clearTimeout(timeoutId);
    }
  }, [pending, state?.success]);

  const attendanceLocked = alreadyAttendedToday || Boolean(state?.success);

  return (
    <form action={formAction} className="w-full space-y-4">
      <div className="break-words rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4 text-sm text-zinc-600">
        <p>Nama: {userName}</p>
        <p>Kelas: {className ?? "-"}</p>
      </div>

      {alreadyAttendedToday ? (
        <p className="break-words rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          Kamu sudah absen hari ini
          {attendanceTime ? ` pada ${formatSiswaAttendanceTime(attendanceTime)}` : ""}.
        </p>
      ) : null}

      <Field
        id="tujuan"
        label="Tujuan kunjungan"
        placeholder="Kunjungan perpustakaan siswa"
        required
        disabled={attendanceLocked}
        value={tujuanInput}
        onChange={(value) => {
          setHideSuccessNotice(true);
          setTujuanInput(value);
        }}
      />

      {state?.error ? (
        <p className="break-words rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}

      {state?.success && !hideSuccessNotice ? (
        <p className="break-words rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {state.success}
        </p>
      ) : null}

      {pending ? (
        <div className="inline-flex w-full items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm text-sky-800 sm:w-auto">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-sky-600" />
          Menyimpan absensi, mohon tunggu...
        </div>
      ) : null}

      <button
        type="submit"
        disabled={pending || attendanceLocked}
        className="inline-flex min-h-[44px] w-full min-w-44 items-center justify-center rounded-xl bg-[#1d66d6] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#1553b2] disabled:cursor-not-allowed disabled:bg-zinc-400 sm:w-auto"
      >
        {attendanceLocked
          ? "Sudah absen hari ini"
          : pending
            ? "Menyimpan..."
            : "Catat absensi saya"}
      </button>
    </form>
  );
}

function formatSiswaAttendanceTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(date);
}

function Field({
  id,
  label,
  placeholder,
  required,
  disabled,
  value,
  onChange,
  readOnly,
}: {
  id: string;
  label: string;
  placeholder: string;
  required?: boolean;
  disabled?: boolean;
  value?: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
}) {
  return (
    <div className="min-w-0 space-y-2">
      <label htmlFor={id} className="text-sm font-medium text-zinc-800">
        {label} {required ? <span className="text-red-500">*</span> : null}
      </label>
      <input
        id={id}
        name={id}
        required={required}
        placeholder={placeholder}
        disabled={disabled}
        value={value}
        readOnly={readOnly}
        onChange={(event) => onChange?.(event.currentTarget.value)}
        className="min-h-[44px] w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-[#1d66d6] read-only:cursor-not-allowed read-only:bg-zinc-100 read-only:text-zinc-600 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500"
      />
    </div>
  );
}
