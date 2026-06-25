const SHEET_ID = "18TbxyCQ-bdEp8vs2bsxqo9zRZ-mritYvLa7Twwpsa1U";
const SHEET_GID = "433514608";
const DIRECT_CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${SHEET_GID}`;
const VALUES_CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=Valores`;
const AUTO_REFRESH_SECONDS = 60;

const state = {
  items: [],
  forecastRows: [],
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

async function loadValuesCsvText() {
  const urls = [];
  if (window.location.protocol !== "file:") {
    urls.push(new URL("/api/values", window.location.origin).toString());
  }
  urls.push(VALUES_CSV_URL);

  let lastError = null;
  for (const url of urls) {
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

  throw lastError || new Error("Nao foi possivel carregar a aba Valores.");
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

function normalizeForecastRows(rows) {
  if (!rows.length) return [];

  const keys = Object.keys(rows[0]).filter(Boolean);
  const dateKey = findKey(keys, ["data", "date"]);
  const incomeKey = findKey(keys, ["valores", "valor", "receita", "entrada", "recebimento"]);
  const expenseKey = findKey(keys, ["despesas", "despesa", "saida", "contas"]);
  const balanceKey = findKey(keys, ["saldo", "balance"]);

  if (!dateKey || !incomeKey || !expenseKey) return [];

  return rows.flatMap((row) => {
    const date = parseDate(row[dateKey]);
    if (!date) return [];

    const income = Math.abs(parseAmount(row[incomeKey]));
    const expense = Math.abs(parseAmount(row[expenseKey]));
    const parsedBalance = balanceKey ? parseAmount(row[balanceKey]) : income - expense;
    const monthInfo = monthInfoFromDate(date);

    return [{
      date,
      income,
      expense,
      balance: parsedBalance,
      monthKey: monthInfo.key,
      monthLabel: monthInfo.displayLabel,
    }];
  });
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

  renderOverviewChart(items);
  renderMonthlyChart(items, accountsMode);
  renderStatusChart(items);
  renderAccumulatedChart(items, accountsMode);
  renderTable(items);
}

function renderOverviewChart(items) {
  const selectedMonth = getElement("periodFilter").value;
  const availableRows = [...state.forecastRows].sort((a, b) => a.date - b.date);
  const latestMonthKey = availableRows.at(-1)?.monthKey;
  const forecastMonthKey = selectedMonth === "all" ? latestMonthKey : selectedMonth;
  const selectedRows = availableRows.filter((row) => row.monthKey === forecastMonthKey);
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const rowsUntilToday = selectedRows.filter((row) => row.date <= today);
  const currentRow = rowsUntilToday.at(-1) || selectedRows[0] || null;
  const futureRows = currentRow
    ? selectedRows.filter((row) => row.date > currentRow.date)
    : [];
  const nextRow = futureRows[0] || null;
  const currentBalance = currentRow?.balance || 0;
  const nextIncome = nextRow?.income || 0;
  const nextExpense = nextRow?.expense || 0;
  const projectedBalance = currentBalance + nextIncome - nextExpense;
  const balanceAfterIncome = currentBalance + nextIncome;
  const currentLabel = currentRow ? `Dia ${currentRow.date.getDate()}` : "Saldo atual";
  const nextLabel = nextRow ? `Dia ${nextRow.date.getDate()}` : "Projecao";

  setText(
    "overviewChartStats",
    selectedRows.length
      ? `Saldo atual mais os proximos movimentos de ${selectedRows[0].monthLabel}`
      : "Nenhum valor encontrado na aba Valores para este periodo"
  );
  setText("overviewMonthBadge", selectedRows[0]?.monthLabel || getSelectedMonthLabel());
  setText("forecastDate15", currentLabel);
  setText("forecastDate30", nextLabel);
  setText("forecastIncomeTotal15", formatCurrencyCompact(currentBalance));
  setText("forecastExpense15", "Contas descontadas");
  setText("forecastBalance15", formatCurrencyCompact(currentBalance));
  setText("forecastIncomeTotal30", formatCurrencyCompact(nextIncome));
  setText("forecastExpense30", formatCurrencyCompact(nextExpense));
  setText("forecastBalance30", formatCurrencyCompact(projectedBalance));
  setText(
    "forecastFormula15",
    `${formatCurrencyCompact(currentBalance)} e o saldo liquido atual; as contas pagas nao sao descontadas novamente.`
  );
  setText(
    "forecastFormula30",
    `${formatCurrencyCompact(currentBalance)} + ${formatCurrencyCompact(nextIncome)} - ${formatCurrencyCompact(nextExpense)} = ${formatCurrencyCompact(projectedBalance)}`
  );
  getElement("forecastCard15").classList.toggle("negative", currentBalance < 0);
  getElement("forecastCard30").classList.toggle("negative", projectedBalance < 0);

  destroyChart("overview");
  const overviewCanvas = getElement("overviewChart");
  const waterfallValues = [currentBalance, nextIncome, -nextExpense, projectedBalance];
  const connectorLevels = [currentBalance, balanceAfterIncome, projectedBalance];
  const waterfallPlugin = {
    id: "forecastWaterfallLabels",
    afterDatasetsDraw(chart) {
      const { ctx, scales } = chart;
      const bars = chart.getDatasetMeta(0).data;

      ctx.save();
      ctx.strokeStyle = "rgba(154, 180, 213, 0.4)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);

      connectorLevels.forEach((level, index) => {
        const currentBar = bars[index];
        const nextBar = bars[index + 1];
        if (!currentBar || !nextBar) return;
        const y = scales.y.getPixelForValue(level);
        ctx.beginPath();
        ctx.moveTo(currentBar.x + currentBar.width / 2, y);
        ctx.lineTo(nextBar.x - nextBar.width / 2, y);
        ctx.stroke();
      });

      ctx.setLineDash([]);
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.font = '700 11px Inter, "Segoe UI", Arial, sans-serif';

      bars.forEach((bar, index) => {
        const value = waterfallValues[index];
        const prefix = index === 1 ? "+" : index === 2 ? "−" : "";
        ctx.fillStyle = index === 2
          ? "#ffb632"
          : index === 1
            ? "#48d597"
            : projectedBalance < 0 && index === 3
              ? "#ff4f5e"
              : "#dce8f5";
        ctx.fillText(
          `${prefix}${formatCurrencyCompact(Math.abs(value))}`,
          bar.x,
          Math.min(bar.y, bar.base) - 8
        );
      });
      ctx.restore();
    },
  };

  state.charts.overview = new Chart(overviewCanvas, {
    type: "bar",
    data: {
      labels: ["Saldo atual", "+ Recebimento", "− Despesas", "Saldo final"],
      datasets: [
        {
          label: "Evolucao do saldo",
          data: [
            [0, currentBalance],
            [currentBalance, balanceAfterIncome],
            [projectedBalance, balanceAfterIncome],
            [0, projectedBalance],
          ],
          backgroundColor: [
            "rgba(0, 184, 255, 0.58)",
            "rgba(72, 213, 151, 0.78)",
            "rgba(255, 182, 50, 0.78)",
            projectedBalance < 0
              ? "rgba(255, 79, 94, 0.72)"
              : "rgba(0, 184, 255, 0.9)",
          ],
          borderColor: [
            "#00b8ff",
            "#48d597",
            "#ffb632",
            projectedBalance < 0 ? "#ff4f5e" : "#00b8ff",
          ],
          borderWidth: 1,
          borderRadius: 8,
          borderSkipped: false,
          maxBarThickness: 58,
          barPercentage: 0.66,
          categoryPercentage: 0.78,
        },
      ],
    },
    plugins: [waterfallPlugin],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "nearest", intersect: true },
      layout: { padding: { top: 6, right: 8, bottom: 0, left: 2 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#0c141b",
          titleColor: "#f4f7fb",
          bodyColor: "#c8d5e5",
          borderColor: "#314152",
          borderWidth: 1,
          padding: 12,
          displayColors: true,
          usePointStyle: true,
          callbacks: {
            label: (context) => {
              const labels = ["Saldo atual", "Recebimento", "Despesas", "Saldo projetado"];
              return `${labels[context.dataIndex]}: ${formatCurrency(waterfallValues[context.dataIndex])}`;
            },
            footer: (items) => items[0]?.dataIndex === 3
              ? `Resultado: ${projectedBalance >= 0 ? "saldo positivo" : "saldo negativo"}`
              : "",
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          grace: "12%",
          ticks: {
            color: "#8295aa",
            maxTicksLimit: 5,
            padding: 8,
            callback: (value) => formatAxisCurrency(value),
          },
          grid: {
            color: (context) => context.tick.value === 0
              ? "rgba(244, 247, 251, 0.25)"
              : "rgba(154, 180, 213, 0.09)",
            lineWidth: (context) => context.tick.value === 0 ? 1.5 : 1,
          },
          border: { display: false },
        },
        x: {
          ticks: {
            color: "#c2ccda",
            padding: 8,
            font: { size: 12, weight: "700" },
          },
          grid: { display: false },
          border: { display: false },
        },
      },
      animation: { duration: 650, easing: "easeOutQuart" },
    },
  });
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

    const [csvText, valuesCsvText] = await Promise.all([
      loadCsvText(),
      loadValuesCsvText().catch(() => ""),
    ]);
    const rows = parseCsv(csvText);
    const items = normalizeRows(rows);
    const valuesRows = valuesCsvText ? parseCsv(valuesCsvText) : [];

    if (!items.length) throw new Error("A planilha carregou, mas nao encontrei registros validos.");

    state.items = items;
    state.forecastRows = normalizeForecastRows(valuesRows);
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
      if (!target) return;

      document.querySelectorAll(".dashboard-view").forEach((view) => {
        view.hidden = view !== target;
      });

      document.querySelectorAll(".nav-tabs button").forEach((item) => {
        item.classList.remove("active");
        item.setAttribute("aria-selected", "false");
      });

      button.classList.add("active");
      button.setAttribute("aria-selected", "true");

      requestAnimationFrame(() => {
        Object.values(state.charts).forEach((chart) => chart?.resize());
        if (window.innerWidth <= 1060) {
          target.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
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
