import { getServerSupabaseClient } from "@/lib/supabase-server";

export type BukuRecord = {
  id_buku: number;
  judul: string;
  penulis: string | null;
  penerbit: string | null;
  tahun_terbit: number | null;
  lokasi_rak: string | null;
  stok_buku: number | null;
};

export type SiswaRecord = {
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

export type TransaksiRecord = {
  id_transaksi: number;
  id_siswa: number;
  id_admin: number;
  tanggal_pinjam: string;
  tanggal_jatuh_tempo: string;
  tanggal_kembali: string | null;
  status: string | null;
  catatan: string | null;
};

type Row = Record<string, unknown>;

type DetailTableConfig = {
  table: string;
  transactionIdColumn: string;
  bookIdColumn: string;
  copyIdColumn: string;
  quantityColumn: string;
};

const detailTableConfigs: DetailTableConfig[] = [
  {
    table: "detail_transaksi",
    transactionIdColumn: "id_transaksi",
    bookIdColumn: "id_buku",
    copyIdColumn: "id_copy_buku",
    quantityColumn: "jumlah",
  },
];

export type TransactionBookItem = {
  key: string;
  transactionId: number;
  bookId: number | null;
  copyIds: number[];
  title: string;
  author: string | null;
  code: string | null;
  category: string | null;
  quantity: number;
};

export type DetailedTransactionRecord = TransaksiRecord & {
  siswa: {
    id_siswa: number;
    nama: string;
    nisn: string | null;
    kelas: string | null;
    nomor_whatsapp: string | null;
  } | null;
  items: TransactionBookItem[];
};

export type SiswaDetailedTransactionRecord = TransaksiRecord & {
  items: TransactionBookItem[];
};

export type AbsensiRecord = {
  id_absensi: number;
  nama: string;
  tujuan: string | null;
  jenis_pengunjung: string | null;
  waktu_kunjungan: string | null;
  kelas_saat_absen?: string | null;
  instansi_asal?: string | null;
};

export type AttendanceRecordFilters = {
  limit?: number;
  page?: number;
  search?: string;
  visitorType?: "siswa" | "umum" | "";
  startDate?: string;
  endDate?: string;
};

export type AttendanceRecordPage = {
  records: AbsensiRecord[];
  total: number;
  currentPage: number;
  totalPages: number;
  limit: number;
};

export function getTodayAttendanceDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Jakarta",
    year: "numeric",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}-${values.month}-${values.day}`;
}

function getAttendanceDayBounds(dateKey: string) {
  return {
    end: `${dateKey}T23:59:59+07:00`,
    start: `${dateKey}T00:00:00+07:00`,
  };
}

function readString(row: Row, keys: string[]) {
  for (const key of keys) {
    const value = row[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function readNumber(row: Row, keys: string[]) {
  for (const key of keys) {
    const value = row[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) {
      return Number(value);
    }
  }

  return null;
}

export async function getBooks() {
  const supabase = getServerSupabaseClient();
  const { data, error } = await supabase
    .from("buku")
    .select("id_buku, judul, penulis, penerbit, tahun_terbit, lokasi_rak, stok_buku")
    .order("id_buku", { ascending: true })
    .returns<BukuRecord[]>();

  if (error) {
    throw new Error(`Failed to load books: ${error.message}`);
  }

  return data ?? [];
}

export async function getStudents() {
  const supabase = getServerSupabaseClient();
  const { data, error } = await supabase
    .from("siswa")
    .select(
      "id_siswa, nama, nisn, username, email, kelas, tahun_masuk, nomor_whatsapp, status_keanggotaan"
    )
    .order("id_siswa", { ascending: false })
    .returns<SiswaRecord[]>();

  if (error) {
    throw new Error(`Failed to load students: ${error.message}`);
  }

  return data ?? [];
}

export async function getStudentById(idSiswa: number) {
  const supabase = getServerSupabaseClient();
  const { data, error } = await supabase
    .from("siswa")
    .select(
      "id_siswa, nama, nisn, username, email, kelas, tahun_masuk, nomor_whatsapp, status_keanggotaan"
    )
    .eq("id_siswa", idSiswa)
    .limit(1)
    .maybeSingle<SiswaRecord>();

  if (error) {
    throw new Error(`Failed to load student profile: ${error.message}`);
  }

  return data;
}

export async function getTransactions() {
  const supabase = getServerSupabaseClient();
  const { data, error } = await supabase
    .from("transaksi")
    .select(
      "id_transaksi, id_siswa, id_admin, tanggal_pinjam, tanggal_jatuh_tempo, tanggal_kembali, status, catatan"
    )
    .order("id_transaksi", { ascending: false })
    .returns<TransaksiRecord[]>();

  if (error) {
    throw new Error(`Failed to load transactions: ${error.message}`);
  }

  return data ?? [];
}

async function loadTransactionDetailRows(transactionIds: number[]) {
  if (transactionIds.length === 0) {
    return { rows: [] as Row[], config: null as DetailTableConfig | null };
  }

  const supabase = getServerSupabaseClient();
  let emptyResult: { rows: Row[]; config: DetailTableConfig } | null = null;

  for (const config of detailTableConfigs) {
    const { data, error } = await supabase
      .from(config.table)
      .select("*")
      .in(config.transactionIdColumn, transactionIds);

    if (!error && data) {
      const rows = data as Row[];

      if (rows.length > 0) {
        return { rows, config };
      }

      emptyResult ??= { rows, config };
    }
  }

  if (emptyResult) {
    return emptyResult;
  }

  return { rows: [] as Row[], config: null };
}

async function loadBookMap(bookIds: number[]) {
  if (bookIds.length === 0) {
    return new Map<number, BukuRecord>();
  }

  const supabase = getServerSupabaseClient();
  const { data, error } = await supabase
    .from("buku")
    .select("id_buku, judul, penulis, penerbit, tahun_terbit, lokasi_rak, stok_buku")
    .in("id_buku", bookIds)
    .returns<BukuRecord[]>();

  if (error) {
    return new Map<number, BukuRecord>();
  }

  return new Map((data ?? []).map((book) => [book.id_buku, book]));
}

export async function getDetailedTransactions(): Promise<DetailedTransactionRecord[]> {
  const [transactions, students] = await Promise.all([
    getTransactions(),
    getStudents(),
  ]);
  const transactionIds = transactions.map((item) => item.id_transaksi);
  const { rows, config } = await loadTransactionDetailRows(transactionIds);
  const bookIdKeys = config
    ? [config.bookIdColumn, "id_buku", "book_id"]
    : ["id_buku", "book_id"];
  const copyIdKeys = config
    ? [
        config.copyIdColumn,
        "id_copy_buku",
        "id_copy",
        "copy_id",
        "id_eksemplar",
      ]
    : ["id_copy_buku", "id_copy", "copy_id", "id_eksemplar"];
  const bookIds = rows
    .map((row) => readNumber(row, bookIdKeys))
    .filter((id): id is number => typeof id === "number");
  const bookMap = await loadBookMap([...new Set(bookIds)]);
  const studentMap = new Map(students.map((student) => [student.id_siswa, student]));
  const itemMap = new Map<number, Map<string, TransactionBookItem>>();

  if (config) {
    rows.forEach((row, rowIndex) => {
      const transactionId = readNumber(row, [
        config.transactionIdColumn,
        "id_transaksi",
        "transaction_id",
      ]);

      if (!transactionId) {
        return;
      }

      const bookId = readNumber(row, bookIdKeys);
      const copyId = readNumber(row, copyIdKeys);
      const quantity = readNumber(row, [
        config.quantityColumn,
        "jumlah",
        "jumlah_buku",
        "qty",
        "quantity",
      ]);
      const book = bookId ? bookMap.get(bookId) : null;
      const key = bookId
        ? `book:${bookId}`
        : copyId
          ? `copy:${copyId}`
          : `row:${rowIndex}`;
      const transactionItems = itemMap.get(transactionId) ?? new Map<string, TransactionBookItem>();
      const current = transactionItems.get(key) ?? {
        key,
        transactionId,
        bookId,
        copyIds: [],
        title:
          readString(row, ["judul", "judul_buku", "title"]) ??
          book?.judul ??
          "Buku tidak diketahui",
        author: readString(row, ["penulis", "author"]) ?? book?.penulis ?? null,
        code: readString(row, ["kode", "kode_buku", "isbn"]) ?? null,
        category: readString(row, ["kategori", "genre", "nama_genre"]) ?? null,
        quantity: 0,
      };

      if (copyId && !current.copyIds.includes(copyId)) {
        current.copyIds.push(copyId);
      }

      current.quantity += quantity && quantity > 0 ? quantity : 1;
      transactionItems.set(key, current);
      itemMap.set(transactionId, transactionItems);
    });
  }

  return transactions.map((transaction) => {
    const siswa = studentMap.get(transaction.id_siswa) ?? null;

    return {
      ...transaction,
      siswa: siswa
        ? {
            id_siswa: siswa.id_siswa,
            nama: siswa.nama,
            nisn: siswa.nisn,
            kelas: siswa.kelas,
            nomor_whatsapp: siswa.nomor_whatsapp,
          }
        : null,
      items: Array.from(itemMap.get(transaction.id_transaksi)?.values() ?? []),
    };
  });
}

export async function getAttendanceRecords(
  options?: number | AttendanceRecordFilters
) {
  const filters = typeof options === "number" ? { limit: options } : options ?? {};
  const supabase = getServerSupabaseClient();
  let query = supabase
    .from("absensi")
    .select("id_absensi, nama, tujuan, jenis_pengunjung, waktu_kunjungan")
    .order("waktu_kunjungan", { ascending: false });

  const search = filters.search?.trim();

  if (search) {
    query = query.ilike("nama", `%${search}%`);
  }

  if (filters.visitorType) {
    query = query.eq("jenis_pengunjung", filters.visitorType);
  }

  if (filters.startDate) {
    query = query.gte("waktu_kunjungan", `${filters.startDate}T00:00:00+07:00`);
  }

  if (filters.endDate) {
    query = query.lte("waktu_kunjungan", `${filters.endDate}T23:59:59+07:00`);
  }

  if (filters.limit) {
    query = query.limit(filters.limit);
  }

  const { data, error } = await query.returns<AbsensiRecord[]>();

  if (error) {
    throw new Error(`Failed to load attendance: ${error.message}`);
  }

  return enrichAttendanceRecords(data ?? []);
}

async function enrichAttendanceRecords(records: AbsensiRecord[]) {
  const attendanceIds = records.map((record) => record.id_absensi);

  if (attendanceIds.length === 0) {
    return records;
  }

  const supabase = getServerSupabaseClient();
  const [studentDetails, publicDetails] = await Promise.all([
    supabase
      .from("absensi_siswa")
      .select("id_absensi, kelas_saat_absen")
      .in("id_absensi", attendanceIds)
      .returns<Array<{ id_absensi: number; kelas_saat_absen: string | null }>>(),
    supabase
      .from("absensi_umum")
      .select("id_absensi, instansi_asal")
      .in("id_absensi", attendanceIds)
      .returns<Array<{ id_absensi: number; instansi_asal: string | null }>>(),
  ]);
  const studentDetailMap = new Map(
    studentDetails.error
      ? []
      : (studentDetails.data ?? []).map((detail) => [
          detail.id_absensi,
          detail.kelas_saat_absen,
        ])
  );
  const publicDetailMap = new Map(
    publicDetails.error
      ? []
      : (publicDetails.data ?? []).map((detail) => [
          detail.id_absensi,
          detail.instansi_asal,
        ])
  );

  return records.map((record) => ({
    ...record,
    kelas_saat_absen: studentDetailMap.get(record.id_absensi) ?? null,
    instansi_asal: publicDetailMap.get(record.id_absensi) ?? null,
  }));
}

export async function getAttendanceRecordPage(
  filters: AttendanceRecordFilters = {}
): Promise<AttendanceRecordPage> {
  const limit = Math.max(1, filters.limit ?? 25);
  const requestedPage = Math.max(1, filters.page ?? 1);
  const supabase = getServerSupabaseClient();

  let countQuery = supabase
    .from("absensi")
    .select("id_absensi", { count: "exact", head: true });

  const search = filters.search?.trim();

  if (search) {
    countQuery = countQuery.ilike("nama", `%${search}%`);
  }

  if (filters.visitorType) {
    countQuery = countQuery.eq("jenis_pengunjung", filters.visitorType);
  }

  if (filters.startDate) {
    countQuery = countQuery.gte(
      "waktu_kunjungan",
      `${filters.startDate}T00:00:00+07:00`
    );
  }

  if (filters.endDate) {
    countQuery = countQuery.lte(
      "waktu_kunjungan",
      `${filters.endDate}T23:59:59+07:00`
    );
  }

  const { count, error: countError } = await countQuery;

  if (countError) {
    throw new Error(`Failed to count attendance: ${countError.message}`);
  }

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const currentPage = Math.min(requestedPage, totalPages);
  const from = (currentPage - 1) * limit;
  const to = from + limit - 1;

  let query = supabase
    .from("absensi")
    .select("id_absensi, nama, tujuan, jenis_pengunjung, waktu_kunjungan")
    .order("waktu_kunjungan", { ascending: false })
    .range(from, to);

  if (search) {
    query = query.ilike("nama", `%${search}%`);
  }

  if (filters.visitorType) {
    query = query.eq("jenis_pengunjung", filters.visitorType);
  }

  if (filters.startDate) {
    query = query.gte("waktu_kunjungan", `${filters.startDate}T00:00:00+07:00`);
  }

  if (filters.endDate) {
    query = query.lte("waktu_kunjungan", `${filters.endDate}T23:59:59+07:00`);
  }

  const { data, error } = await query.returns<AbsensiRecord[]>();

  if (error) {
    throw new Error(`Failed to load attendance page: ${error.message}`);
  }

  const records = await enrichAttendanceRecords(data ?? []);

  return {
    records,
    total,
    currentPage,
    totalPages,
    limit,
  };
}

export async function getSiswaTransactions(idSiswa: number) {
  const supabase = getServerSupabaseClient();
  const { data, error } = await supabase
    .from("transaksi")
    .select(
      "id_transaksi, id_siswa, id_admin, tanggal_pinjam, tanggal_jatuh_tempo, tanggal_kembali, status, catatan"
    )
    .eq("id_siswa", idSiswa)
    .order("id_transaksi", { ascending: false })
    .returns<TransaksiRecord[]>();

  if (error) {
    throw new Error(`Failed to load siswa transactions: ${error.message}`);
  }

  return data ?? [];
}

export async function getDetailedSiswaTransactions(
  idSiswa: number
): Promise<SiswaDetailedTransactionRecord[]> {
  const transactions = await getSiswaTransactions(idSiswa);
  const transactionIds = transactions.map((item) => item.id_transaksi);
  const { rows, config } = await loadTransactionDetailRows(transactionIds);
  const bookIdKeys = config
    ? [config.bookIdColumn, "id_buku", "book_id"]
    : ["id_buku", "book_id"];
  const copyIdKeys = config
    ? [
        config.copyIdColumn,
        "id_copy_buku",
        "id_copy",
        "copy_id",
        "id_eksemplar",
      ]
    : ["id_copy_buku", "id_copy", "copy_id", "id_eksemplar"];
  const bookIds = rows
    .map((row) => readNumber(row, bookIdKeys))
    .filter((id): id is number => typeof id === "number");
  const bookMap = await loadBookMap([...new Set(bookIds)]);
  const transactionIdSet = new Set(transactionIds);
  const itemMap = new Map<number, Map<string, TransactionBookItem>>();

  if (config) {
    rows.forEach((row, rowIndex) => {
      const transactionId = readNumber(row, [
        config.transactionIdColumn,
        "id_transaksi",
        "transaction_id",
      ]);

      if (!transactionId || !transactionIdSet.has(transactionId)) {
        return;
      }

      const bookId = readNumber(row, bookIdKeys);
      const copyId = readNumber(row, copyIdKeys);
      const quantity = readNumber(row, [
        config.quantityColumn,
        "jumlah",
        "jumlah_buku",
        "qty",
        "quantity",
      ]);
      const book = bookId ? bookMap.get(bookId) : null;
      const key = bookId
        ? `book:${bookId}`
        : copyId
          ? `copy:${copyId}`
          : `row:${rowIndex}`;
      const transactionItems =
        itemMap.get(transactionId) ?? new Map<string, TransactionBookItem>();
      const current = transactionItems.get(key) ?? {
        key,
        transactionId,
        bookId,
        copyIds: [],
        title:
          readString(row, ["judul", "judul_buku", "title"]) ??
          book?.judul ??
          "Buku tidak diketahui",
        author: readString(row, ["penulis", "author"]) ?? book?.penulis ?? null,
        code: readString(row, ["kode", "kode_buku", "isbn"]) ?? null,
        category: readString(row, ["kategori", "genre", "nama_genre"]) ?? null,
        quantity: 0,
      };

      if (copyId && !current.copyIds.includes(copyId)) {
        current.copyIds.push(copyId);
      }

      current.quantity += quantity && quantity > 0 ? quantity : 1;
      transactionItems.set(key, current);
      itemMap.set(transactionId, transactionItems);
    });
  }

  return transactions.map((transaction) => ({
    ...transaction,
    items: Array.from(itemMap.get(transaction.id_transaksi)?.values() ?? []),
  }));
}

export type SiswaBorrowingSummary = {
  transactions: TransaksiRecord[];
  activeTransactions: TransaksiRecord[];
  activeItems: SiswaActiveBorrowingItem[];
  activeBookCount: number;
};

export type SiswaActiveBorrowingItem = {
  key: string;
  transactionId: number;
  title: string;
  quantity: number;
  dueDate: string;
  borrowedAt: string;
  status: string | null;
};

export async function getSiswaBorrowingSummary(
  idSiswa: number
): Promise<SiswaBorrowingSummary> {
  const transactions = await getSiswaTransactions(idSiswa);
  const activeTransactions = transactions.filter(
    (item) => item.tanggal_kembali === null
  );
  const activeTransactionIds = activeTransactions.map((item) => item.id_transaksi);

  if (activeTransactionIds.length === 0) {
    return {
      transactions,
      activeTransactions,
      activeItems: [],
      activeBookCount: 0,
    };
  }

  const { rows, config } = await loadTransactionDetailRows(activeTransactionIds);
  const activeTransactionIdSet = new Set(activeTransactionIds);
  const activeTransactionMap = new Map(
    activeTransactions.map((transaction) => [transaction.id_transaksi, transaction])
  );
  const bookIdKeys = config
    ? [config.bookIdColumn, "id_buku", "book_id"]
    : ["id_buku", "book_id"];
  const quantityKeys = config
    ? [config.quantityColumn, "jumlah", "jumlah_buku", "qty", "quantity"]
    : ["jumlah", "jumlah_buku", "qty", "quantity"];
  const transactionIdKeys = config
    ? [config.transactionIdColumn, "id_transaksi", "transaction_id"]
    : ["id_transaksi", "transaction_id"];
  const bookIds = rows
    .map((row) => readNumber(row, bookIdKeys))
    .filter((id): id is number => typeof id === "number");
  const bookMap = await loadBookMap([...new Set(bookIds)]);
  const itemMap = new Map<string, SiswaActiveBorrowingItem>();

  rows.forEach((row, rowIndex) => {
    const transactionId = readNumber(row, transactionIdKeys);
    const transaction = transactionId ? activeTransactionMap.get(transactionId) : null;

    if (!transactionId || !transaction || !activeTransactionIdSet.has(transactionId)) {
      return;
    }

    const bookId = readNumber(row, bookIdKeys);
    const quantity = readNumber(row, quantityKeys);
    const title =
      readString(row, ["judul", "judul_buku", "title"]) ??
      (bookId ? bookMap.get(bookId)?.judul : null) ??
      `Buku transaksi #${transactionId}`;
    const key = `${transactionId}:${bookId ?? title}:${rowIndex}`;
    const groupedKey = bookId ? `${transactionId}:book:${bookId}` : key;
    const current = itemMap.get(groupedKey) ?? {
      key: groupedKey,
      transactionId,
      title,
      quantity: 0,
      dueDate: transaction.tanggal_jatuh_tempo,
      borrowedAt: transaction.tanggal_pinjam,
      status: transaction.status,
    };

    current.quantity += quantity && quantity > 0 ? quantity : 1;
    itemMap.set(groupedKey, current);
  });

  const activeItems = Array.from(itemMap.values()).sort((first, second) => {
    const firstTime = new Date(first.dueDate).getTime();
    const secondTime = new Date(second.dueDate).getTime();

    return firstTime - secondTime;
  });
  const fallbackItems =
    activeItems.length > 0
      ? activeItems
      : activeTransactions.map((transaction) => ({
          key: `transaction:${transaction.id_transaksi}`,
          transactionId: transaction.id_transaksi,
          title: `Detail buku transaksi #${transaction.id_transaksi}`,
          quantity: 1,
          dueDate: transaction.tanggal_jatuh_tempo,
          borrowedAt: transaction.tanggal_pinjam,
          status: transaction.status,
        }));

  return {
    transactions,
    activeTransactions,
    activeItems: fallbackItems,
    activeBookCount: fallbackItems.reduce((total, item) => total + item.quantity, 0),
  };
}

export async function getRecentSiswaAttendances(idSiswa: number, limit = 2) {
  const supabase = getServerSupabaseClient();
  const safeLimit = Math.max(1, Math.min(limit, 10));
  const { data: attendanceLinks, error: linkError } = await supabase
    .from("absensi_siswa")
    .select("id_absensi")
    .eq("id_siswa", idSiswa)
    .order("id_absensi", { ascending: false })
    .limit(safeLimit * 5)
    .returns<Array<{ id_absensi: number }>>();

  if (linkError) {
    throw new Error(`Failed to load siswa attendance link: ${linkError.message}`);
  }

  const attendanceIds = (attendanceLinks ?? []).map((item) => item.id_absensi);

  if (attendanceIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("absensi")
    .select("id_absensi, nama, tujuan, jenis_pengunjung, waktu_kunjungan")
    .in("id_absensi", attendanceIds)
    .order("waktu_kunjungan", { ascending: false })
    .limit(safeLimit)
    .returns<AbsensiRecord[]>();

  if (error) {
    throw new Error(`Failed to load recent siswa attendance: ${error.message}`);
  }

  return data ?? [];
}

export async function getLatestSiswaAttendance(idSiswa: number) {
  const [latestAttendance] = await getRecentSiswaAttendances(idSiswa, 1);

  return latestAttendance ?? null;
}

export async function getSiswaAttendanceOnDate(
  idSiswa: number,
  dateKey = getTodayAttendanceDateKey()
) {
  if (!Number.isInteger(idSiswa) || idSiswa <= 0) {
    return null;
  }

  const supabase = getServerSupabaseClient();
  const { data: attendanceLinks, error: linkError } = await supabase
    .from("absensi_siswa")
    .select("id_absensi")
    .eq("id_siswa", idSiswa)
    .order("id_absensi", { ascending: false })
    .limit(200)
    .returns<Array<{ id_absensi: number }>>();

  if (linkError) {
    throw new Error(`Failed to load siswa attendance link: ${linkError.message}`);
  }

  const attendanceIds = (attendanceLinks ?? []).map((item) => item.id_absensi);

  if (attendanceIds.length === 0) {
    return null;
  }

  const bounds = getAttendanceDayBounds(dateKey);
  const { data, error } = await supabase
    .from("absensi")
    .select("id_absensi, nama, tujuan, jenis_pengunjung, waktu_kunjungan")
    .in("id_absensi", attendanceIds)
    .gte("waktu_kunjungan", bounds.start)
    .lte("waktu_kunjungan", bounds.end)
    .order("waktu_kunjungan", { ascending: false })
    .limit(1)
    .returns<AbsensiRecord[]>();

  if (error) {
    throw new Error(`Failed to load siswa attendance for date: ${error.message}`);
  }

  return data?.[0] ?? null;
}

export async function getSiswaAttendanceToday(idSiswa: number) {
  return getSiswaAttendanceOnDate(idSiswa);
}

export type StudentSuggestion = {
  id_siswa: number;
  nama: string;
  nisn: string | null;
  kelas: string | null;
};

export async function getStudentNameSuggestions(limit = 250) {
  const supabase = getServerSupabaseClient();
  const { data, error } = await supabase
    .from("siswa")
    .select("id_siswa, nama, nisn, kelas")
    .in("status_keanggotaan", ["aktif", "menunggu_verifikasi"])
    .not("nama", "is", null)
    .order("nama", { ascending: true })
    .limit(limit)
    .returns<StudentSuggestion[]>();

  if (error) {
    throw new Error(`Failed to load student name suggestions: ${error.message}`);
  }

  return (data ?? []).filter((item) => item.nama?.trim().length > 0);
}
