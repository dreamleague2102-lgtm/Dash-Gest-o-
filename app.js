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

const compactCurrencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat("pt-BR");
const percentFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
});

function getElement(id) {
  return document.getElementById(id);
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function formatCurrency(value) {
  return currencyFormatter.format(Number(value) || 0);
}

function formatCurrencyCompact(value) {
  return compactCurrencyFormatter.format(Number(value) || 0);
}

function formatPercent(value) {
  return `${percentFormatter.format(Number(value) || 0)}%`;
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
    cleaned = cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")
      ? cleaned.replace(/\./g, "").replace(",", ".")
      : cleaned.replace(/,/g, "");
  } else if (cleaned.includes(",")) {
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (cleaned.includes(".")) {
    const parts = cleaned.split(".");
    const decimalPart = parts[parts.length - 1];
    if (parts.length > 2 || decimalPart.length === 3) {
      cleaned = cleaned.replace(/\./g, "");
    }
  }

  cleaned = cleaned.replace(/(?!^)-/g, "");
  const parsed = Number.parseFloat(cleaned);
  if (Number.isNaN(parsed)) return 0;
  return isNegative ? -Math.abs(parsed) : parsed;
}

function isValidDate(date) {
  return date instanceof Date && !Number.isNaN(date.getTime());
}

function parseDate(value) {
  if (isValidDate(value)) return value;

  const text = String(value ?? "").trim();
  if (!text) return null;

  const isoMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const date = new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
    return isValidDate(date) ? date : null;
  }

  const dateMatch = text.match(/^(\d{1,2})[/. -](\d{1,2})[/. -](\d{2,4})$/);
  if (dateMatch) {
    const yearText = dateMatch[3];
    const year = Number(yearText.length === 2 ? `20${yearText}` : yearText);
    const date = new Date(year, Number(dateMatch[2]) - 1, Number(dateMatch[1]));
    return isValidDate(date) ? date : null;
  }

  return null;
}

function monthInfoFromDate(date) {
  if (!isValidDate(date)) {
    return { key: "sem-mes", label: "Sem mes", displayLabel: "Sem mes", sort: 999999 };
  }

  const year = date.getFullYear();
  const month = date.getMonth();
  return {
    key: `${year}-${String(month + 1).padStart(2, "0")}`,
    label: `${monthCatalog[month].label}/${year}`,
    displayLabel: `${monthCatalog[month].label} ${year}`,
    sort: year * 12 + month,
  };
}

function monthInfoFromText(value, fallbackYear = new Date().getFullYear()) {
  const parsedDate = parseDate(value);
  if (parsedDate) return monthInfoFromDate(parsedDate);

  const text = normalizeText(value);
  if (!text) return null;

  const yearMatch = text.match(/(19\d{2}|20\d{2})/);
  const year = yearMatch ? Number(yearMatch[1]) : fallbackYear;
  const found = monthCatalog.find((month) =>
    month.aliases.some((alias) => text === alias || text.includes(alias))
  );

  if (!found) return null;

  return {
    key: `${year}-${String(found.index + 1).padStart(2, "0")}`,
    label: `${found.label}/${year}`,
    displayLabel: `${found.label} ${year}`,
    sort: year * 12 + found.index,
  };
}

function resolveMonthInfo(date, monthText) {
  return monthInfoFromText(monthText) || monthInfoFromDate(date);
}

function buildStatus(value) {
  const normalized = normalizeText(value);
  if (["pago", "quitado", "liquidado", "recebido", "ok", "sim"].some((term) => normalized.includes(term))) {
    return "Liquidado";
  }
  if (["atras", "vencido"].some((term) => normalized.includes(term))) {
    return "Atrasado";
  }
  return "Pendente";
}

function buildType(value, fallback) {
  const normalized = normalizeText(value);
  if (["entrada", "receita", "credito", "recebimento", "venda"].some((term) => normalized.includes(term))) return "entrada";
  if (["saida", "despesa", "debito", "custo", "pagamento"].some((term) => normalized.includes(term))) return "saida";
  return fallback;
}

function typeLabel(type) {
  if (type === "entrada") return "Entrada";
  if (type === "saida") return "Saida";
  return "Conta";
}

function normalizeRows(rows) {
  if (!rows.length) return [];

  const keys = Object.keys(rows[0]).filter(Boolean);
  const descKey = findKey(keys, ["descr", "descricao", "titulo", "cliente", "item", "nome", "name"]);
  const amountKey = findKey(keys, ["valor", "amount", "value", "total", "preco", "price"]);
  const statusKey = findKey(keys, ["status", "estado", "situacao", "pago"]);
  const dateKey = findKey(keys, ["data", "date", "vencimento", "pagamento", "lancamento"]);
  const typeKey = findKey(keys, ["tipo", "natureza", "movimento"]);
  const categoryKey = findKey(keys, ["categoria", "category", "grupo", "segmento"]);
  const sourceKey = findKey(keys, ["fonte", "origem", "conta", "banco", "fornecedor"]);
  const sheetKey = findKey(keys, ["aba", "sheet", "planilha"]);
  const monthKey = findKey(keys, ["mes", "competencia", "periodo"]);
  const revenueKey = findKey(keys, ["receita", "faturamento", "entrada"]);
  const expenseKey = findKey(keys, ["despesa", "custo", "saida"]);
  const simpleAccountMode = Boolean(amountKey && !typeKey && !revenueKey && !expenseKey);

  return rows.flatMap((row, rowIndex) => {
    const date = dateKey ? parseDate(row[dateKey]) : null;
    const monthText = monthKey ? row[monthKey] : sheetKey ? row[sheetKey] : "";
    const monthInfo = resolveMonthInfo(date, monthText);
    const description = String(descKey ? row[descKey] : `Registro ${rowIndex + 1}`).trim() || `Registro ${rowIndex + 1}`;
    const category = String(categoryKey ? row[categoryKey] : "Contas").trim() || "Contas";
    const source = String(sourceKey ? row[sourceKey] : category).trim() || category;
    const status = buildStatus(statusKey ? row[statusKey] : "");
    const entries = [];

    if (revenueKey || expenseKey) {
      const revenue = revenueKey ? Math.abs(parseAmount(row[revenueKey])) : 0;
      const expense = expenseKey ? Math.abs(parseAmount(row[expenseKey])) : 0;
      if (revenue) entries.push(buildItem({ description, category, source, status, date, monthInfo, amount: revenue, type: "entrada" }));
      if (expense) entries.push(buildItem({ description, category, source, status, date, monthInfo, amount: expense, type: "saida" }));
      return entries;
    }

    const amount = Math.abs(parseAmount(amountKey ? row[amountKey] : 0));
    if (!amount && !description) return [];

    const type = buildType(typeKey ? row[typeKey] : "", simpleAccountMode ? "conta" : "saida");
    return [buildItem({ description, category, source, status, date, monthInfo, amount, type })];
  });
}

function buildItem({ description, category, source, status, date, monthInfo, amount, type }) {
  return {
    description,
    category,
    source,
    status,
    type,
    typeLabel: typeLabel(type),
    amount,
    signedAmount: type === "saida" ? -amount : amount,
    receita: type === "entrada" ? amount : 0,
    despesa: type === "saida" ? amount : 0,
    lucro: type === "entrada" ? amount : type === "saida" ? -amount : 0,
    date,
    monthKey: monthInfo.key,
    monthLabel: monthInfo.label,
    monthDisplayLabel: monthInfo.displayLabel,
    monthSort: monthInfo.sort,
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
  return `${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`;
}

async function loadCsvText() {
  let lastError = null;

  for (const url of buildSourceUrls()) {
    try {
      const response = await fetch(withCacheBuster(url), { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      if (!text.trim() || text.trim().startsWith("<")) throw new Error("A resposta nao parece ser CSV.");
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

function isAccountsMode(items) {
  return items.length > 0 && items.every((item) => item.type === "conta");
}

function calculateTotals(items) {
  const totals = {
    totalAmount: 0,
    paidAmount: 0,
    pendingAmount: 0,
    lateAmount: 0,
    openAmount: 0,
    receita: 0,
    despesa: 0,
    lucro: 0,
    count: 0,
    liquidado: 0,
    pendente: 0,
    atrasado: 0,
  };

  items.forEach((item) => {
    totals.totalAmount += item.amount;
    totals.receita += item.receita;
    totals.despesa += item.despesa;
    totals.lucro += item.lucro;
    totals.count += 1;

    if (item.status === "Liquidado") {
      totals.liquidado += 1;
      totals.paidAmount += item.amount;
    } else if (item.status === "Atrasado") {
      totals.atrasado += 1;
      totals.lateAmount += item.amount;
    } else {
      totals.pendente += 1;
      totals.pendingAmount += item.amount;
    }
  });

  totals.openAmount = totals.pendingAmount + totals.lateAmount;
  totals.margem = totals.receita ? (totals.lucro / totals.receita) * 100 : 0;
  return totals;
}

function aggregateMonthly(items) {
  const map = new Map();

  items.forEach((item) => {
    const current =
      map.get(item.monthKey) || {
        value: item.monthKey,
        label: item.monthLabel,
        displayLabel: item.monthDisplayLabel,
        sort: item.monthSort,
        totalAmount: 0,
        paidAmount: 0,
        openAmount: 0,
        receita: 0,
        despesa: 0,
        lucro: 0,
        count: 0,
      };

    current.totalAmount += item.amount;
    current.receita += item.receita;
    current.despesa += item.despesa;
    current.lucro += item.lucro;
    current.count += 1;

    if (item.status === "Liquidado") current.paidAmount += item.amount;
    if (item.status !== "Liquidado") current.openAmount += item.amount;

    map.set(item.monthKey, current);
  });

  return Array.from(map.values())
    .filter((row) => row.value !== "sem-mes")
    .sort((a, b) => a.sort - b.sort);
}

function monthKeyFromParts(year, monthIndex) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

function yearFromMonthKey(monthKey) {
  const year = Number(String(monthKey).slice(0, 4));
  return Number.isFinite(year) && year > 0 ? year : new Date().getFullYear();
}

function monthKeyParts(monthKey) {
  const match = String(monthKey).match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (!Number.isFinite(year) || monthIndex < 0 || monthIndex > 11) return null;
  return { year, monthIndex };
}

function resolveChartYear(items) {
  const selectedMonth = getElement("periodFilter").value;
  if (selectedMonth !== "all") return yearFromMonthKey(selectedMonth);

  const rows = aggregateMonthly(items.length ? items : state.items);
  const latest = rows[rows.length - 1];
  return latest ? Math.floor(latest.sort / 12) : new Date().getFullYear();
}

function buildYearMonthRows(items, year) {
  const monthMap = new Map(aggregateMonthly(items).map((row) => [row.value, row]));

  return monthCatalog.map((month) => {
    const key = monthKeyFromParts(year, month.index);
    const current = monthMap.get(key);

    return {
      value: key,
      label: month.label,
      displayLabel: `${month.label} ${year}`,
      sort: year * 12 + month.index,
      totalAmount: current ? current.totalAmount : 0,
      paidAmount: current ? current.paidAmount : 0,
      openAmount: current ? current.openAmount : 0,
      receita: current ? current.receita : 0,
      despesa: current ? current.despesa : 0,
      lucro: current ? current.lucro : 0,
      count: current ? current.count : 0,
    };
  });
}

function updateMonthFilters(items) {
  const months = aggregateMonthly(items).sort((a, b) => b.sort - a.sort);
  const periodFilter = getElement("periodFilter");
  const currentValue = periodFilter.value;

  periodFilter.innerHTML = "";
  periodFilter.appendChild(new Option("Todos os meses", "all"));
  months.forEach((month) => periodFilter.appendChild(new Option(month.displayLabel, month.value)));

  if (months.some((month) => month.value === currentValue)) {
    periodFilter.value = currentValue;
  } else {
    periodFilter.value = "all";
  }

  const currentYear = getElement("currentYear");
  if (currentYear) currentYear.textContent = String(new Date().getFullYear());
}

function getFilteredItems() {
  const selectedMonth = getElement("periodFilter").value;
  if (selectedMonth === "all") return state.items;
  return state.items.filter((item) => item.monthKey === selectedMonth);
}

function getSelectedMonthLabel() {
  const selectedMonth = getElement("periodFilter").value;
  if (selectedMonth === "all") return "todos os meses";
  const found = aggregateMonthly(state.items).find((month) => month.value === selectedMonth);
  return found ? found.displayLabel : "mes selecionado";
}

function setText(id, value) {
  const element = getElement(id);
  if (element) element.textContent = value;
}

function updateModeLabels(accountsMode) {
  setText("cardTotalLabel", accountsMode ? "Valor Total" : "Receita Total");
  setText("cardExpenseLabel", accountsMode ? "Total Pago" : "Despesa Total");
  setText("cardProfitLabel", accountsMode ? "Total Pendente" : "Lucro Liquido");
  setText("cardBalanceLabel", accountsMode ? "Contas em Aberto" : "Saldo em Caixa");
  setText("monthlyTitle", accountsMode ? "Pagas vs Pendentes" : "Receita vs Despesa");
  setText("monthlyLegendA", accountsMode ? "Pagas" : "Receita");
  setText("monthlyLegendB", accountsMode ? "Pendentes" : "Despesa");
  setText("dailyLegendA", accountsMode ? "Pago acumulado" : "Receita acumulada");
  setText("dailyLegendB", accountsMode ? "Pendente acumulado" : "Despesa acumulada");
  setText("dailyLegendC", accountsMode ? "Total acumulado" : "Lucro acumulado");
  setText("dailyRevenueLabel", accountsMode ? "Pago" : "Receita");
  setText("dailyExpenseLabel", accountsMode ? "Pendente" : "Despesa");
  setText("dailyProfitLabel", accountsMode ? "Total" : "Lucro");
  setText("tableTypeHeader", accountsMode ? "Classe" : "Tipo");
}

function destroyChart(name) {
  if (state.charts[name]) {
    state.charts[name].destroy();
    state.charts[name] = null;
  }
}

function formatAxisCurrency(value) {
  const abs = Math.abs(Number(value) || 0);
  if (abs >= 1000000) return `${Math.round(value / 1000000)}m`;
  if (abs >= 1000) return `${Math.round(value / 1000)}k`;
  return `${Math.round(value)}`;
}

function chartGridColor() {
  return "rgba(154, 180, 213, 0.12)";
}

function setTrendClass(id, className = "trend-pill") {
  const element = getElement(id);
  if (element) element.className = className;
}

function renderDashboard() {
  const items = getFilteredItems();
  const accountsMode = isAccountsMode(state.items);
  const totals = calculateTotals(items);
  const openCount = totals.pendente + totals.atrasado;
  updateModeLabels(accountsMode);
  setTrendClass("cardRevenueChange");
  setTrendClass("cardExpenseChange");
  setTrendClass("cardProfitChange");
  setTrendClass("cardBalanceChange");

  if (accountsMode) {
    const paidPct = totals.count ? (totals.liquidado / totals.count) * 100 : 0;
    const openPct = totals.count ? (openCount / totals.count) * 100 : 0;

    setText("cardTotal", formatCurrencyCompact(totals.totalAmount));
    setText("cardMonth", formatCurrencyCompact(totals.paidAmount));
    setText("cardAverage", formatCurrencyCompact(totals.openAmount));
    setText("cardBalance", numberFormatter.format(openCount));
    setText("profitMarginText", `${numberFormatter.format(totals.pendente)} pendentes`);
    setText("activeAccountsText", `${formatCurrencyCompact(totals.openAmount)} em aberto`);
    setText("cardRevenueChange", `${numberFormatter.format(totals.count)} contas`);
    setText("cardExpenseChange", formatPercent(paidPct));
    setText("cardProfitChange", formatPercent(openPct));
    setText("cardBalanceChange", `${numberFormatter.format(openCount)} abertas`);
    setTrendClass("cardProfitChange", "trend-pill down");
    setTrendClass("cardBalanceChange", "trend-pill warn");
  } else {
    const margem = totals.receita ? (totals.lucro / totals.receita) * 100 : 0;
    setText("cardTotal", formatCurrencyCompact(totals.receita));
    setText("cardMonth", formatCurrencyCompact(totals.despesa));
    setText("cardAverage", formatCurrencyCompact(totals.lucro));
    setText("cardBalance", formatCurrencyCompact(totals.lucro));
    setText("profitMarginText", `margem ${formatPercent(margem)}`);
    setText("activeAccountsText", `${numberFormatter.format(totals.count)} transacoes`);
    setText("cardRevenueChange", `${numberFormatter.format(totals.count)} itens`);
    setText("cardExpenseChange", formatPercent(totals.despesa ? 100 : 0));
    setText("cardProfitChange", formatPercent(margem));
    setText("cardBalanceChange", "atual");
  }

  renderMonthlyChart(items, accountsMode);
  renderStatusChart(items);
  renderAccumulatedChart(items, accountsMode);
  renderTable(items);
}

function renderMonthlyChart(items, accountsMode) {
  const activeYear = resolveChartYear(items);
  const rows = buildYearMonthRows(items, activeYear);
  const hasValues = rows.some((row) => row.count > 0);
  const labels = rows.map((row) => row.label);
  const firstData = rows.map((row) => (accountsMode ? row.paidAmount : row.receita));
  const secondData = rows.map((row) => (accountsMode ? row.openAmount : row.despesa));

  setText(
    "monthlyStats",
    hasValues
      ? getElement("periodFilter").value === "all"
        ? `Comparativo mensal - ${activeYear}`
        : `Comparativo mensal - ${getSelectedMonthLabel()}`
      : `Comparativo mensal - ${activeYear}`
  );

  destroyChart("monthly");
  state.charts.monthly = new Chart(getElement("monthlyChart"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: accountsMode ? "Pagas" : "Receita",
          data: firstData,
          backgroundColor: "rgba(72, 213, 151, 0.9)",
          borderColor: "#48d597",
          borderSkipped: false,
          borderWidth: 0,
          borderRadius: 6,
          barPercentage: 0.74,
          categoryPercentage: 0.74,
        },
        {
          label: accountsMode ? "Pendentes" : "Despesa",
          data: secondData,
          backgroundColor: "rgba(255, 79, 94, 0.9)",
          borderColor: "#ff4f5e",
          borderSkipped: false,
          borderWidth: 0,
          borderRadius: 6,
          barPercentage: 0.74,
          categoryPercentage: 0.74,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (context) => `${context.dataset.label}: ${formatCurrency(context.parsed.y)}` } },
      },
      scales: {
        y: {
          beginAtZero: true,
          grace: "8%",
          ticks: { color: "#9ab4d5", maxTicksLimit: 5, callback: (value) => formatAxisCurrency(value) },
          grid: { color: chartGridColor() },
        },
        x: { ticks: { color: "#9ab4d5" }, grid: { display: false } },
      },
    },
  });
}

function renderStatusChart(items) {
  const totals = calculateTotals(items);
  setText("statusPaidCount", numberFormatter.format(totals.liquidado));
  setText("statusPendingCount", numberFormatter.format(totals.pendente));
  setText("statusLateCount", numberFormatter.format(totals.atrasado));

  destroyChart("status");
  state.charts.status = new Chart(getElement("statusChart"), {
    type: "doughnut",
    data: {
      labels: ["Pagas", "Pendentes", "Atrasadas"],
      datasets: [
        {
          data: [totals.liquidado, totals.pendente, totals.atrasado],
          backgroundColor: ["#48d597", "#ffb632", "#ff4f5e"],
          borderColor: "#131a22",
          borderWidth: 5,
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

function renderAccumulatedChart(items, accountsMode) {
  const selectedMonth = getElement("periodFilter").value;
  const monthSelected = selectedMonth !== "all";
  const rows = monthSelected ? buildDailyAccumulatedRows(items, accountsMode) : buildMonthlyAccumulatedRows(items, accountsMode);
  const totals = calculateTotals(items);

  setText("dailyRevenue", formatCurrencyCompact(accountsMode ? totals.paidAmount : totals.receita));
  setText("dailyExpense", formatCurrencyCompact(accountsMode ? totals.openAmount : totals.despesa));
  setText("dailyProfit", formatCurrencyCompact(accountsMode ? totals.totalAmount : totals.lucro));
  setText("dailyStats", monthSelected ? `Acumulado diario - ${getSelectedMonthLabel()}` : "Acumulado dos meses");

  destroyChart("daily");
  state.charts.daily = new Chart(getElement("dailyChart"), {
    type: "line",
    data: {
      labels: rows.map((row) => row.label),
      datasets: [
        {
          label: accountsMode ? "Pago acumulado" : "Receita acumulada",
          data: rows.map((row) => row.first),
          borderColor: "#48d597",
          backgroundColor: "rgba(72, 213, 151, 0.08)",
          pointRadius: 2,
          borderWidth: 3,
          tension: 0.32,
        },
        {
          label: accountsMode ? "Pendente acumulado" : "Despesa acumulada",
          data: rows.map((row) => row.second),
          borderColor: "#ff4f5e",
          backgroundColor: "rgba(255, 79, 94, 0.08)",
          pointRadius: 2,
          borderWidth: 3,
          tension: 0.32,
        },
        {
          label: accountsMode ? "Total acumulado" : "Lucro acumulado",
          data: rows.map((row) => row.third),
          borderColor: "#00b8ff",
          backgroundColor: "rgba(0, 184, 255, 0.08)",
          borderDash: [5, 5],
          pointRadius: 2,
          borderWidth: 2,
          tension: 0.32,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (context) => `${context.dataset.label}: ${formatCurrency(context.parsed.y)}` } },
      },
      scales: {
        y: { ticks: { color: "#9ab4d5", callback: (value) => formatAxisCurrency(value) }, grid: { color: chartGridColor() } },
        x: { ticks: { color: "#9ab4d5", maxRotation: 0 }, grid: { display: false } },
      },
    },
  });
}

function buildMonthlyAccumulatedRows(items, accountsMode) {
  const activeYear = resolveChartYear(items);
  let first = 0;
  let second = 0;
  let third = 0;

  return buildYearMonthRows(items, activeYear).map((row) => {
    first += accountsMode ? row.paidAmount : row.receita;
    second += accountsMode ? row.openAmount : row.despesa;
    third += accountsMode ? row.totalAmount : row.lucro;
    return { label: row.label, first, second, third };
  });
}

function buildDailyAccumulatedRows(items, accountsMode) {
  const datedItems = items.filter((item) => isValidDate(item.date));
  const selectedParts = monthKeyParts(getElement("periodFilter").value);
  const lastDate = datedItems.reduce((latest, item) => (latest && latest > item.date ? latest : item.date), null);
  const daysInMonth = selectedParts
    ? new Date(selectedParts.year, selectedParts.monthIndex + 1, 0).getDate()
    : lastDate
      ? new Date(lastDate.getFullYear(), lastDate.getMonth() + 1, 0).getDate()
      : 31;
  const rows = Array.from({ length: daysInMonth }, (_, index) => ({
    label: String(index + 1).padStart(2, "0"),
    first: 0,
    second: 0,
    third: 0,
  }));

  datedItems.forEach((item) => {
    const row = rows[item.date.getDate() - 1];
    if (!row) return;
    row.first += accountsMode ? (item.status === "Liquidado" ? item.amount : 0) : item.receita;
    row.second += accountsMode ? (item.status === "Liquidado" ? 0 : item.amount) : item.despesa;
    row.third += accountsMode ? item.amount : item.lucro;
  });

  let first = 0;
  let second = 0;
  let third = 0;
  return rows.map((row) => {
    first += row.first;
    second += row.second;
    third += row.third;
    return { label: row.label, first, second, third };
  });
}

function renderTable(items) {
  const tbody = document.querySelector("#dataTable tbody");
  tbody.innerHTML = "";
  const sorted = [...items].sort((a, b) => b.monthSort - a.monthSort || (b.date || 0) - (a.date || 0));
  setText("tableStats", `${numberFormatter.format(sorted.length)} registro(s) filtrados.`);

  if (!sorted.length) {
    const row = document.createElement("tr");
    row.innerHTML = '<td colspan="6" class="empty-cell">Nenhum registro encontrado.</td>';
    tbody.appendChild(row);
    return;
  }

  sorted.forEach((item) => {
    const statusClass = item.status === "Liquidado" ? "status-paid" : item.status === "Pendente" ? "status-pending" : "status-other";
    const typeClass = item.type === "entrada" ? "type-income" : item.type === "saida" ? "type-expense" : "type-account";
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml(item.description)}</td>
      <td><span class="type-pill ${typeClass}">${escapeHtml(item.typeLabel)}</span></td>
      <td>${escapeHtml(item.category)}</td>
      <td>${escapeHtml(item.monthLabel)}</td>
      <td><span class="status-pill ${statusClass}">${escapeHtml(item.status)}</span></td>
      <td>${formatCurrency(item.signedAmount)}</td>
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

function exportCurrentData() {
  const items = getFilteredItems();
  const headers = ["Data", "Descricao", "Classe", "Status", "Valor"];
  const rows = items.map((item) => [
    item.date ? item.date.toLocaleDateString("pt-BR") : "",
    item.description,
    item.typeLabel,
    item.status,
    item.amount,
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
  setText("refreshCountdown", `Proxima atualizacao em ${value}s`);
}

function startCountdown() {
  if (state.countdownTimer) clearInterval(state.countdownTimer);
  state.countdownRemaining = AUTO_REFRESH_SECONDS;
  setCountdownText(state.countdownRemaining);

  state.countdownTimer = setInterval(() => {
    state.countdownRemaining -= 1;
    setCountdownText(Math.max(state.countdownRemaining, 0));
    if (state.countdownRemaining <= 0) clearInterval(state.countdownTimer);
  }, 1000);
}

async function refreshData() {
  try {
    setLoading(true);
    setMessage("Carregando planilha...");

    const csvText = await loadCsvText();
    const rows = parseCsv(csvText);
    const items = normalizeRows(rows);

    if (!items.length) throw new Error("A planilha carregou, mas nao encontrei registros validos.");

    state.items = items;
    updateMonthFilters(items);
    renderDashboard();

    setText("lastUpdate", `Ultima atualizacao: ${new Date().toLocaleString("pt-BR")}`);
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

function bindNavigation() {
  document.querySelectorAll(".nav-tabs button").forEach((button) => {
    button.addEventListener("click", () => {
      const target = getElement(button.dataset.target);
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
      document.querySelectorAll(".nav-tabs button").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
    });
  });
}

function bindEvents() {
  getElement("refreshButton").addEventListener("click", refreshData);
  getElement("exportButton").addEventListener("click", exportCurrentData);
  getElement("periodFilter").addEventListener("change", renderDashboard);
  bindNavigation();
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

  if (window.lucide) window.lucide.createIcons();
});
