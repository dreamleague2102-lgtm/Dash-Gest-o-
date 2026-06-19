const SHEET_ID = "18TbxyCQ-bdEp8vs2bsxqo9zRZ-mritYvLa7Twwpsa1U";
const SHEET_GID = "433514608";
const DIRECT_CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${SHEET_GID}`;
const AUTO_REFRESH_SECONDS = 60;

const state = {
  items: [],
  charts: {},
  countdownTimer: null,
  autoRefreshTimer: null,
  countdownRemaining: AUTO_REFRESH_SECONDS,
};

const monthCatalog = [
  { index: 0, label: "Jan", aliases: ["jan", "janeiro"] },
  { index: 1, label: "Fev", aliases: ["fev", "fevereiro"] },
  { index: 2, label: "Mar", aliases: ["mar", "marco"] },
  { index: 3, label: "Abr", aliases: ["abr", "abril"] },
  { index: 4, label: "Mai", aliases: ["mai", "maio"] },
  { index: 5, label: "Jun", aliases: ["jun", "junho"] },
  { index: 6, label: "Jul", aliases: ["jul", "julho"] },
  { index: 7, label: "Ago", aliases: ["ago", "agosto"] },
  { index: 8, label: "Set", aliases: ["set", "setembro"] },
  { index: 9, label: "Out", aliases: ["out", "outubro"] },
  { index: 10, label: "Nov", aliases: ["nov", "novembro"] },
  { index: 11, label: "Dez", aliases: ["dez", "dezembro"] },
];

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const numberFormatter = new Intl.NumberFormat("pt-BR");

const percentFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
});

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function getElement(id) {
  return document.getElementById(id);
}

function formatCurrency(value) {
  return currencyFormatter.format(Number(value) || 0);
}

function formatCurrencyCompact(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

function formatPercent(value) {
  return `${percentFormatter.format(Number(value) || 0)}%`;
}

function isValidDate(date) {
  return date instanceof Date && !Number.isNaN(date.getTime());
}

function findKey(keys, candidates) {
  return keys.find((key) => {
    const normalizedKey = normalizeText(key);
    return candidates.some((candidate) => normalizedKey.includes(candidate));
  });
}

function parseAmount(value) {
  if (typeof value === "number") return value;

  const original = String(value ?? "").trim();
  if (!original) return 0;

  const isNegative = original.includes("-") || /^\(.+\)$/.test(original);
  let cleaned = original.replace(/[^\d,.-]/g, "");

  if (cleaned.includes(",") && cleaned.includes(".")) {
    if (cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")) {
      cleaned = cleaned.replace(/\./g, "").replace(",", ".");
    } else {
      cleaned = cleaned.replace(/,/g, "");
    }
  } else if (cleaned.includes(",")) {
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (cleaned.includes(".")) {
    const parts = cleaned.split(".");
    const integerPart = parts[0].replace("-", "");
    const decimalPart = parts[parts.length - 1];

    if (parts.length > 2 || (decimalPart.length === 3 && integerPart.length <= 3)) {
      cleaned = cleaned.replace(/\./g, "");
    }
  }

  cleaned = cleaned.replace(/(?!^)-/g, "");
  const parsed = Number.parseFloat(cleaned);
  if (Number.isNaN(parsed)) return 0;
  return isNegative ? -Math.abs(parsed) : parsed;
}

function parseDate(value) {
  if (isValidDate(value)) return value;
  if (typeof value === "number" && value > 20000) {
    return new Date(Math.round((value - 25569) * 86400 * 1000));
  }

  const text = String(value ?? "").trim();
  if (!text) return null;

  const isoMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]) - 1;
    const day = Number(isoMatch[3]);
    const date = new Date(year, month, day);
    return isValidDate(date) ? date : null;
  }

  const dateMatch = text.match(/^(\d{1,2})[/. -](\d{1,2})[/. -](\d{2,4})$/);
  if (dateMatch) {
    const day = Number(dateMatch[1]);
    const month = Number(dateMatch[2]) - 1;
    const year = Number(dateMatch[3].length === 2 ? `20${dateMatch[3]}` : dateMatch[3]);
    const date = new Date(year, month, day);
    return isValidDate(date) ? date : null;
  }

  const monthYearMatch = text.match(/^(\d{1,2})[/. -](\d{2,4})$/);
  if (monthYearMatch) {
    const month = Number(monthYearMatch[1]) - 1;
    const year = Number(monthYearMatch[2].length === 2 ? `20${monthYearMatch[2]}` : monthYearMatch[2]);
    const date = new Date(year, month, 1);
    return isValidDate(date) ? date : null;
  }

  if (/[a-zA-Z]/.test(text)) {
    const parsed = new Date(text);
    return isValidDate(parsed) ? parsed : null;
  }

  return null;
}

function monthInfoFromDate(date) {
  if (!isValidDate(date)) return null;
  const year = date.getFullYear();
  const month = date.getMonth();
  const meta = monthCatalog[month];

  return {
    key: `${year}-${String(month + 1).padStart(2, "0")}`,
    label: `${meta.label}/${year}`,
    sort: year * 12 + month,
  };
}

function monthInfoFromText(value) {
  const text = normalizeText(value);
  if (!text) return null;

  const parsedDate = parseDate(value);
  if (parsedDate) return monthInfoFromDate(parsedDate);

  const yearMatch = text.match(/(19\d{2}|20\d{2})/);
  const year = yearMatch ? Number(yearMatch[1]) : new Date().getFullYear();

  const found = monthCatalog.find((month) =>
    month.aliases.some((alias) => {
      return (
        text === alias ||
        text.startsWith(`${alias} `) ||
        text.startsWith(`${alias}/`) ||
        text.startsWith(`${alias}-`) ||
        text.includes(` ${alias} `) ||
        text.endsWith(` ${alias}`) ||
        text.includes(` ${alias}/`) ||
        text.includes(` ${alias}-`)
      );
    })
  );

  if (!found) return null;

  return {
    key: `${year}-${String(found.index + 1).padStart(2, "0")}`,
    label: `${found.label}/${year}`,
    sort: year * 12 + found.index,
  };
}

function isMonthColumn(key) {
  const normalized = normalizeText(key);
  if (!normalized || normalized.includes("status") || normalized.includes("data")) return false;
  return Boolean(monthInfoFromText(key));
}

function buildStatus(value) {
  const normalized = normalizeText(value);
  if (!normalized) return "Pendente";
  if (["pago", "quitado", "liquidado", "recebido", "sim", "ok", "concluido"].some((term) => normalized.includes(term))) {
    return "Liquidado";
  }
  if (["atras", "vencido"].some((term) => normalized.includes(term))) {
    return "Atrasado";
  }
  if (["cancel"].some((term) => normalized.includes(term))) {
    return "Cancelado";
  }
  return "Pendente";
}

function buildType(value, amount, fallback = "saida") {
  const normalized = normalizeText(value);

  if (["entrada", "receita", "recebimento", "credito", "venda", "faturamento"].some((term) => normalized.includes(term))) {
    return "entrada";
  }

  if (["saida", "despesa", "custo", "debito", "pagamento", "conta"].some((term) => normalized.includes(term))) {
    return "saida";
  }

  if (Number(amount) < 0) return "saida";
  return fallback;
}

function labelType(type) {
  return type === "entrada" ? "Entrada" : "Saida";
}

function compact(value, fallback) {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function normalizeRows(rows) {
  if (!rows.length) return [];

  const keys = Object.keys(rows[0]).filter(Boolean);
  const descKey = findKey(keys, ["descr", "descricao", "titulo", "cliente", "item", "nome", "name"]);
  const categoryKey = findKey(keys, ["categoria", "category", "grupo", "segmento", "departamento"]);
  const typeKey = findKey(keys, ["tipo", "natureza", "movimento", "entrada saida", "entrada/saida"]);
  const sourceKey = findKey(keys, ["fonte", "origem", "conta", "banco", "fornecedor", "cliente"]);
  const revenueKey = findKey(keys, ["receita", "faturamento", "entrada"]);
  const expenseKey = findKey(keys, ["despesa", "custo", "saida"]);
  const hasSplitValues = Boolean(revenueKey && expenseKey);
  const amountKey = findKey(keys, ["valor", "amount", "value", "total", "preco", "price"]);
  const statusKey = findKey(keys, ["status", "pago", "estado", "situacao"]);
  const dateKey = findKey(keys, ["data", "date", "vencimento", "pagamento", "lancamento"]);
  const monthKey = findKey(keys, ["mes", "competencia", "periodo"]);
  const monthColumns = keys.filter(isMonthColumn);

  if (monthColumns.length && (!amountKey || monthColumns.length > 1)) {
    return rows.flatMap((row, rowIndex) => {
      return monthColumns
        .map((monthColumn) => {
          const amount = parseAmount(row[monthColumn]);
          if (amount === 0) return null;

          const monthInfo = monthInfoFromText(monthColumn);

          return buildItem({
            row,
            rowIndex,
            descKey,
            categoryKey,
            sourceKey,
            typeKey,
            statusKey,
            amount,
            date: null,
            monthInfo,
            fallbackType: buildType(typeKey ? row[typeKey] : "", amount),
          });
        })
        .filter(Boolean);
    });
  }

  if (hasSplitValues) {
    return rows.flatMap((row, rowIndex) => {
      const date = dateKey ? parseDate(row[dateKey]) : null;
      const monthInfo = date ? monthInfoFromDate(date) : monthKey ? monthInfoFromText(row[monthKey]) : null;
      const entries = [];
      const revenue = parseAmount(row[revenueKey]);
      const expense = parseAmount(row[expenseKey]);

      if (revenue !== 0) {
        entries.push(
          buildItem({
            row,
            rowIndex,
            descKey,
            categoryKey,
            sourceKey,
            typeKey,
            statusKey,
            amount: revenue,
            date,
            monthInfo,
            fallbackType: "entrada",
          })
        );
      }

      if (expense !== 0) {
        entries.push(
          buildItem({
            row,
            rowIndex,
            descKey,
            categoryKey,
            sourceKey,
            typeKey,
            statusKey,
            amount: expense,
            date,
            monthInfo,
            fallbackType: "saida",
          })
        );
      }

      return entries.filter(Boolean);
    });
  }

  return rows
    .map((row, rowIndex) => {
      const date = dateKey ? parseDate(row[dateKey]) : null;
      const monthInfo = date ? monthInfoFromDate(date) : monthKey ? monthInfoFromText(row[monthKey]) : null;
      const amountValue = amountKey ? parseAmount(row[amountKey]) : revenueKey ? parseAmount(row[revenueKey]) : 0;
      const fallbackType = revenueKey && !amountKey ? "entrada" : "saida";

      return buildItem({
        row,
        rowIndex,
        descKey,
        categoryKey,
        sourceKey,
        typeKey,
        statusKey,
        amount: amountValue,
        date,
        monthInfo,
        fallbackType,
      });
    })
    .filter(Boolean);
}

function buildItem({ row, rowIndex, descKey, categoryKey, sourceKey, typeKey, statusKey, amount, date, monthInfo, fallbackType = "saida" }) {
  const description = compact(descKey ? row[descKey] : "", `Registro ${rowIndex + 1}`);
  const category = compact(categoryKey ? row[categoryKey] : "", "Sem categoria");
  const source = compact(sourceKey ? row[sourceKey] : "", category);
  const status = buildStatus(statusKey ? row[statusKey] : "");
  const type = buildType(typeKey ? row[typeKey] : "", amount, fallbackType);
  const absoluteAmount = Math.abs(Number(amount) || 0);
  const resolvedMonth = monthInfo || monthInfoFromDate(date) || {
    key: "sem-mes",
    label: "Sem mes",
    sort: 999999,
  };

  if (!description && !category && !absoluteAmount) return null;

  return {
    description,
    category,
    source,
    status,
    type,
    typeLabel: labelType(type),
    amount: absoluteAmount,
    signedAmount: type === "entrada" ? absoluteAmount : -absoluteAmount,
    receita: type === "entrada" ? absoluteAmount : 0,
    despesa: type === "saida" ? absoluteAmount : 0,
    lucro: type === "entrada" ? absoluteAmount : -absoluteAmount,
    date,
    monthKey: resolvedMonth.key,
    monthLabel: resolvedMonth.label,
    monthSort: resolvedMonth.sort,
    searchable: normalizeText(`${description} ${category} ${source} ${status} ${labelType(type)} ${resolvedMonth.label}`),
  };
}

function buildSourceUrls() {
  const urls = [];
  if (window.location.protocol !== "file:") {
    urls.push(new URL("/api/sheet", window.location.origin).toString());
  }
  urls.push(DIRECT_CSV_URL);
  return urls;
}

function withCacheBuster(url) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}t=${Date.now()}`;
}

async function loadCsvText() {
  let lastError = null;

  for (const url of buildSourceUrls()) {
    try {
      const response = await fetch(withCacheBuster(url), { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const text = await response.text();
      if (!text.trim() || text.trim().startsWith("<")) {
        throw new Error("A resposta nao parece ser CSV.");
      }
      return text;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Nao foi possivel carregar a planilha.");
}

function parseCsv(text) {
  const result = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
  });

  if (result.errors.length && !result.data.length) {
    throw new Error(result.errors[0].message);
  }

  return result.data.filter((row) => Object.values(row).some((value) => String(value ?? "").trim()));
}

function setSelectOptions(select, options, allLabel) {
  if (!select) return;
  const currentValue = select.value;
  select.innerHTML = "";

  const allOption = document.createElement("option");
  allOption.value = "";
  allOption.textContent = allLabel;
  select.appendChild(allOption);

  options.forEach((option) => {
    const element = document.createElement("option");
    element.value = option.value;
    element.textContent = option.displayLabel || option.label;
    select.appendChild(element);
  });

  if (options.some((option) => option.value === currentValue)) {
    select.value = currentValue;
  }
}

function updateFilters(items) {
  const months = Array.from(
    new Map(items.map((item) => [item.monthKey, { value: item.monthKey, label: item.monthLabel, displayLabel: labelFromMonthKey(item.monthKey), sort: item.monthSort }])).values()
  )
    .filter((month) => month.value !== "sem-mes")
    .sort((a, b) => b.sort - a.sort);

  setSelectOptions(getElement("dailyMonthFilter"), months, "Mes atual");
  const currentYear = getElement("currentYear");
  if (currentYear) currentYear.textContent = String(new Date().getFullYear());
}

function getFilteredItems(options = {}) {
  const context = getPeriodContext(state.items);

  return options.previous ? context.previousItems : context.currentItems;
}

function aggregateBy(items, keyBuilder) {
  return Array.from(
    items.reduce((map, item) => {
      const key = keyBuilder(item);
      const current = map.get(key.value) || { ...key, amount: 0, receita: 0, despesa: 0, lucro: 0, count: 0 };
      current.amount += item.amount;
      current.receita += item.receita;
      current.despesa += item.despesa;
      current.lucro += item.lucro;
      current.count += 1;
      map.set(key.value, current);
      return map;
    }, new Map()).values()
  );
}

function calculateTotals(items) {
  const totals = items.reduce(
    (acc, item) => {
      acc.receita += item.receita;
      acc.despesa += item.despesa;
      acc.lucro += item.lucro;
      acc.count += 1;
      if (item.status === "Liquidado") acc.liquidado += 1;
      if (item.status === "Pendente") acc.pendente += 1;
      if (item.status === "Atrasado") acc.atrasado += 1;
      return acc;
    },
    { receita: 0, despesa: 0, lucro: 0, count: 0, liquidado: 0, pendente: 0, atrasado: 0 }
  );

  totals.margem = totals.receita ? (totals.lucro / totals.receita) * 100 : 0;
  totals.saldo = totals.lucro;
  return totals;
}

function aggregateMonthly(items) {
  const grouped = aggregateBy(items, (item) => ({
    value: item.monthKey,
    label: item.monthLabel,
    sort: item.monthSort,
  })).sort((a, b) => a.sort - b.sort);

  let saldo = 0;
  return grouped.map((row) => {
    saldo += row.lucro;
    return {
      ...row,
      saldo,
      margem: row.receita ? (row.lucro / row.receita) * 100 : 0,
    };
  });
}

function monthSortYear(sort) {
  return Math.floor(sort / 12);
}

function getValidMonthSorts(items) {
  return Array.from(new Set(items.filter((item) => item.monthKey !== "sem-mes").map((item) => item.monthSort))).sort((a, b) => a - b);
}

function getPeriodContext(items) {
  const period = getElement("periodFilter")?.value || "last12";
  const monthSorts = getValidMonthSorts(items);

  if (!monthSorts.length || period === "all") {
    return {
      currentItems: items,
      previousItems: [],
      label: period === "all" ? "Todos os dados" : "Sem periodo definido",
    };
  }

  const maxSort = monthSorts[monthSorts.length - 1];

  if (period === "currentYear") {
    const year = new Date().getFullYear();
    const previousYear = year - 1;

    return {
      currentItems: items.filter((item) => item.monthKey === "sem-mes" || monthSortYear(item.monthSort) === year),
      previousItems: items.filter((item) => monthSortYear(item.monthSort) === previousYear),
      label: String(year),
    };
  }

  const start = maxSort - 11;
  const previousStart = maxSort - 23;
  const previousEnd = maxSort - 12;

  return {
    currentItems: items.filter((item) => item.monthKey === "sem-mes" || (item.monthSort >= start && item.monthSort <= maxSort)),
    previousItems: items.filter((item) => item.monthSort >= previousStart && item.monthSort <= previousEnd),
    label: "ultimos 12 meses",
  };
}

function getPeriodLabel() {
  return getPeriodContext(state.items).label;
}

function variationPercent(current, previous) {
  if (!previous && !current) return 0;
  if (!previous) return current ? 100 : 0;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function setTrendBadge(id, current, previous, options = {}) {
  const element = getElement(id);
  if (!element) return;

  const pct = variationPercent(current, previous);
  const symbol = pct >= 0 ? "▲" : "▼";
  element.textContent = `${symbol} ${formatPercent(Math.abs(pct))}`;
  element.className = "trend-pill";

  if (options.expense) {
    element.classList.toggle("down", pct > 0);
    element.classList.toggle("warn", pct < 0);
    return;
  }

  element.classList.toggle("down", pct < 0);
}

function formatAxisCurrency(value) {
  const abs = Math.abs(Number(value) || 0);
  if (abs >= 1000000) return `${Math.round(value / 1000000)}m`;
  if (abs >= 1000) return `${Math.round(value / 1000)}k`;
  return `${Math.round(value)}`;
}

function destroyChart(name) {
  if (state.charts[name]) {
    state.charts[name].destroy();
    state.charts[name] = null;
  }
}

function formatSignedCurrency(value) {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${formatCurrency(Math.abs(value))}`;
}

function monthInfoFromOffset(offset) {
  const now = new Date();
  return monthInfoFromDate(new Date(now.getFullYear(), now.getMonth() + offset, 1));
}

function renderMonthlyChart(items) {
  const currentMonthKey = monthInfoFromOffset(0).key;
  const grouped = aggregateMonthly(items);

  const singleYear = new Set(grouped.map((item) => monthSortYear(item.sort))).size === 1;
  const labels = grouped.map((item) => (singleYear ? item.label.split("/")[0] : item.label));
  const receitas = grouped.map((item) => item.receita);
  const despesas = grouped.map((item) => item.despesa);

  getElement("monthlyStats").textContent = grouped.length
    ? `Comparativo mensal · ${getPeriodLabel()}`
    : "Nenhum mes encontrado nos filtros atuais.";

  destroyChart("monthly");
  state.charts.monthly = new Chart(getElement("monthlyChart"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Receita",
          data: receitas,
          backgroundColor: grouped.map((item) => (item.value === currentMonthKey ? "rgba(72, 213, 151, 1)" : "rgba(72, 213, 151, 0.88)")),
          borderColor: "#2dd4bf",
          borderWidth: 1,
          borderRadius: 5,
          barPercentage: 0.72,
          categoryPercentage: 0.7,
        },
        {
          label: "Despesa",
          data: despesas,
          backgroundColor: grouped.map((item) => (item.value === currentMonthKey ? "rgba(255, 79, 94, 1)" : "rgba(255, 79, 94, 0.9)")),
          borderColor: "#ff4f5e",
          borderWidth: 1,
          borderRadius: 5,
          barPercentage: 0.72,
          categoryPercentage: 0.7,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => `${context.dataset.label}: ${formatCurrency(context.parsed.y)}`,
          },
        },
      },
      scales: {
        y: {
          ticks: { color: "#9ab4d5", callback: (value) => formatAxisCurrency(value) },
          grid: { color: "rgba(154, 180, 213, 0.12)", borderDash: [4, 4] },
        },
        x: {
          ticks: { color: "#9ab4d5" },
          grid: { display: false },
        },
      },
    },
  });
}

function renderStatusChart(items) {
  const paid = items.filter((item) => item.status === "Liquidado").length;
  const pending = items.filter((item) => item.status === "Pendente").length;
  const late = items.filter((item) => item.status === "Atrasado").length;

  getElement("statusPaidCount").textContent = numberFormatter.format(paid);
  getElement("statusPendingCount").textContent = numberFormatter.format(pending);
  getElement("statusLateCount").textContent = numberFormatter.format(late);

  destroyChart("status");
  state.charts.status = new Chart(getElement("statusChart"), {
    type: "doughnut",
    data: {
      labels: ["Pagas", "Pendentes", "Atrasadas"],
      datasets: [
        {
          data: [paid, pending, late],
          backgroundColor: ["#48d597", "#ffb632", "#ff4f5e"],
          borderColor: "#131a22",
          borderWidth: 5,
          hoverOffset: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "62%",
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (context) => `${context.label}: ${numberFormatter.format(context.parsed)}` } },
      },
    },
  });
}

function monthKeyParts(monthKey) {
  const [year, month] = String(monthKey || "").split("-").map(Number);
  if (!year || !month) return null;
  return { year, monthIndex: month - 1 };
}

function resolveDailyMonth(items) {
  const selected = getElement("dailyMonthFilter")?.value;
  if (selected) return selected;

  const current = monthInfoFromOffset(0);
  if (items.some((item) => item.monthKey === current.key)) return current.key;

  const sortedMonths = getValidMonthSorts(items);
  if (!sortedMonths.length) return current.key;

  const lastSort = sortedMonths[sortedMonths.length - 1];
  const year = monthSortYear(lastSort);
  const monthIndex = lastSort - year * 12;
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

function labelFromMonthKey(monthKey) {
  const parts = monthKeyParts(monthKey);
  if (!parts) return "Mes atual";
  return `${monthCatalog[parts.monthIndex].label} ${parts.year}`;
}

function renderDailyChart(items) {
  const monthKey = resolveDailyMonth(items);
  const parts = monthKeyParts(monthKey);
  const monthItems = items.filter((item) => item.monthKey === monthKey && isValidDate(item.date));
  const totals = calculateTotals(monthItems);

  getElement("dailyRevenue").textContent = formatCurrencyCompact(totals.receita);
  getElement("dailyExpense").textContent = formatCurrencyCompact(totals.despesa);
  getElement("dailyProfit").textContent = formatCurrencyCompact(totals.lucro);
  getElement("dailyStats").textContent = `Evolucao diaria · ${labelFromMonthKey(monthKey)}`;

  const daysInMonth = parts ? new Date(parts.year, parts.monthIndex + 1, 0).getDate() : 31;
  const rows = Array.from({ length: daysInMonth }, (_, index) => ({
    day: index + 1,
    label: String(index + 1).padStart(2, "0"),
    receita: 0,
    despesa: 0,
    lucro: 0,
  }));

  monthItems.forEach((item) => {
    const day = item.date.getDate();
    const row = rows[day - 1];
    if (!row) return;
    row.receita += item.receita;
    row.despesa += item.despesa;
    row.lucro += item.lucro;
  });

  destroyChart("daily");
  state.charts.daily = new Chart(getElement("dailyChart"), {
    type: "line",
    data: {
      labels: rows.map((row) => row.label),
      datasets: [
        {
          label: "Receita",
          data: rows.map((row) => row.receita),
          borderColor: "#48d597",
          backgroundColor: "rgba(72, 213, 151, 0.08)",
          pointRadius: 0,
          borderWidth: 3,
          tension: 0.36,
        },
        {
          label: "Despesa",
          data: rows.map((row) => row.despesa),
          borderColor: "#ff4f5e",
          backgroundColor: "rgba(255, 79, 94, 0.08)",
          pointRadius: 0,
          borderWidth: 3,
          tension: 0.36,
        },
        {
          label: "Lucro",
          data: rows.map((row) => row.lucro),
          borderColor: "#00b8ff",
          backgroundColor: "rgba(0, 184, 255, 0.08)",
          borderDash: [5, 5],
          pointRadius: 0,
          borderWidth: 2,
          tension: 0.36,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (contexts) => `${contexts[0].label}/${String(parts ? parts.monthIndex + 1 : new Date().getMonth() + 1).padStart(2, "0")}`,
            label: (context) => `${context.dataset.label}: ${formatCurrency(context.parsed.y)}`,
          },
        },
      },
      scales: {
        y: {
          ticks: { color: "#9ab4d5", callback: (value) => formatAxisCurrency(value) },
          grid: { color: "rgba(154, 180, 213, 0.12)", borderDash: [4, 4] },
        },
        x: {
          ticks: { color: "#9ab4d5", maxRotation: 0, autoSkip: true, maxTicksLimit: 31 },
          grid: { display: false },
        },
      },
    },
  });
}

function renderTable(items) {
  const tbody = document.querySelector("#dataTable tbody");
  tbody.innerHTML = "";

  const sorted = [...items].sort((a, b) => b.monthSort - a.monthSort).slice(0, 100);
  getElement("tableStats").textContent = `${numberFormatter.format(items.length)} registro(s) filtrados.`;

  if (!sorted.length) {
    const row = document.createElement("tr");
    row.innerHTML = '<td colspan="6" class="empty-cell">Nenhum registro encontrado.</td>';
    tbody.appendChild(row);
    return;
  }

  sorted.forEach((item) => {
    const row = document.createElement("tr");
    const statusClass = item.status === "Liquidado" ? "status-paid" : item.status === "Pendente" ? "status-pending" : "status-other";
    const typeClass = item.type === "entrada" ? "type-income" : "type-expense";

    row.innerHTML = `
      <td>${escapeHtml(item.description)}</td>
      <td><span class="type-pill ${typeClass}">${escapeHtml(item.typeLabel)}</span></td>
      <td>${escapeHtml(item.category)}</td>
      <td>${escapeHtml(item.monthLabel)}</td>
      <td><span class="status-pill ${statusClass}">${escapeHtml(item.status)}</span></td>
      <td>${formatSignedCurrency(item.signedAmount)}</td>
    `;
    tbody.appendChild(row);
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderDashboard() {
  const items = getFilteredItems();
  const previousItems = getFilteredItems({ previous: true });
  const totals = calculateTotals(items);
  const previousTotals = calculateTotals(previousItems);
  const monthlyRows = aggregateMonthly(items);
  const saldoAtual = monthlyRows.length ? monthlyRows[monthlyRows.length - 1].saldo : totals.lucro;
  const previousSaldo = calculateTotals(previousItems).lucro;
  const activeAccounts = new Set(items.map((item) => item.source || item.category).filter(Boolean)).size;
  getElement("cardTotal").textContent = formatCurrencyCompact(totals.receita);
  getElement("cardMonth").textContent = formatCurrencyCompact(totals.despesa);
  getElement("cardAverage").textContent = formatCurrencyCompact(totals.lucro);
  getElement("cardBalance").textContent = formatCurrencyCompact(saldoAtual);
  getElement("profitMarginText").textContent = `margem ${formatPercent(totals.margem)}`;
  getElement("activeAccountsText").textContent = `${numberFormatter.format(activeAccounts)} contas ativas`;

  setTrendBadge("cardRevenueChange", totals.receita, previousTotals.receita);
  setTrendBadge("cardExpenseChange", totals.despesa, previousTotals.despesa, { expense: true });
  setTrendBadge("cardProfitChange", totals.lucro, previousTotals.lucro);
  setTrendBadge("cardBalanceChange", saldoAtual, previousSaldo, { expense: saldoAtual < 0 });

  renderMonthlyChart(items);
  renderStatusChart(items);
  renderDailyChart(items);
  renderTable(items);
}

function setMessage(text, isError = false) {
  const message = getElement("messageBox");
  message.textContent = text;
  message.classList.toggle("error", isError);
}

function setLoading(isLoading) {
  const button = getElement("refreshButton");
  button.disabled = isLoading;
  button.classList.toggle("loading", isLoading);
}

function setCountdownText(value) {
  getElement("refreshCountdown").textContent = `Proxima atualizacao em ${value}s`;
}

function startCountdown() {
  if (state.countdownTimer) clearInterval(state.countdownTimer);
  state.countdownRemaining = AUTO_REFRESH_SECONDS;
  setCountdownText(state.countdownRemaining);

  state.countdownTimer = setInterval(() => {
    state.countdownRemaining -= 1;
    setCountdownText(Math.max(state.countdownRemaining, 0));
    if (state.countdownRemaining <= 0) {
      clearInterval(state.countdownTimer);
      state.countdownTimer = null;
    }
  }, 1000);
}

async function refreshData() {
  try {
    setLoading(true);
    setMessage("Carregando planilha...");

    const csvText = await loadCsvText();
    const rows = parseCsv(csvText);
    const items = normalizeRows(rows);

    if (!items.length) {
      throw new Error("A planilha carregou, mas nao encontrei registros validos.");
    }

    state.items = items;
    updateFilters(items);
    renderDashboard();

    getElement("lastUpdate").textContent = `Ultima atualizacao: ${new Date().toLocaleString("pt-BR")}`;
    setMessage(`Planilha sincronizada com ${numberFormatter.format(items.length)} registro(s).`);
    startCountdown();
  } catch (error) {
    setMessage(`Erro ao carregar a planilha: ${error.message}`, true);
  } finally {
    setLoading(false);
  }
}

function startAutoRefresh() {
  if (state.autoRefreshTimer) clearInterval(state.autoRefreshTimer);
  state.autoRefreshTimer = setInterval(refreshData, AUTO_REFRESH_SECONDS * 1000);
}

function exportCurrentData() {
  const items = getFilteredItems();
  const headers = ["Data", "Descricao", "Tipo", "Categoria", "Fonte", "Status", "Receita", "Despesa", "Lucro"];
  const rows = items.map((item) => [
    item.date ? item.date.toLocaleDateString("pt-BR") : "",
    item.description,
    item.typeLabel,
    item.category,
    item.source,
    item.status,
    item.receita,
    item.despesa,
    item.lucro,
  ]);

  const csv = [headers, ...rows]
    .map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `painel-financeiro-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function bindEvents() {
  getElement("refreshButton").addEventListener("click", refreshData);
  getElement("exportButton").addEventListener("click", exportCurrentData);
  getElement("periodFilter").addEventListener("change", renderDashboard);
  getElement("dailyMonthFilter").addEventListener("change", renderDashboard);
}

document.addEventListener("DOMContentLoaded", () => {
  if (window.Chart) {
    Chart.defaults.font.family = 'Inter, "Segoe UI", Arial, sans-serif';
    Chart.defaults.color = "#c2ccda";
    Chart.defaults.borderColor = "rgba(149, 163, 184, 0.16)";
  }

  bindEvents();
  refreshData();
  startAutoRefresh();

  if (window.lucide) {
    window.lucide.createIcons();
  }
});
