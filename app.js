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
  if (["pago", "quitado", "recebido", "sim", "ok", "concluido"].some((term) => normalized.includes(term))) {
    return "Pago";
  }
  if (["atras", "vencido"].some((term) => normalized.includes(term))) {
    return "Atrasado";
  }
  if (["cancel"].some((term) => normalized.includes(term))) {
    return "Cancelado";
  }
  return "Pendente";
}

function compact(value, fallback) {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function normalizeRows(rows) {
  if (!rows.length) return [];

  const keys = Object.keys(rows[0]).filter(Boolean);
  const descKey = findKey(keys, ["descr", "descricao", "titulo", "cliente", "item", "nome", "name"]);
  const categoryKey = findKey(keys, ["categoria", "category", "tipo", "grupo", "segmento"]);
  const amountKey = findKey(keys, ["valor", "amount", "value", "total", "receita", "faturamento", "preco", "price"]);
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
            statusKey,
            amount,
            date: null,
            monthInfo,
          });
        })
        .filter(Boolean);
    });
  }

  return rows
    .map((row, rowIndex) => {
      const date = dateKey ? parseDate(row[dateKey]) : null;
      const monthInfo = date ? monthInfoFromDate(date) : monthKey ? monthInfoFromText(row[monthKey]) : null;

      return buildItem({
        row,
        rowIndex,
        descKey,
        categoryKey,
        statusKey,
        amount: amountKey ? parseAmount(row[amountKey]) : 0,
        date,
        monthInfo,
      });
    })
    .filter(Boolean);
}

function buildItem({ row, rowIndex, descKey, categoryKey, statusKey, amount, date, monthInfo }) {
  const description = compact(descKey ? row[descKey] : "", `Registro ${rowIndex + 1}`);
  const category = compact(categoryKey ? row[categoryKey] : "", "Sem categoria");
  const status = buildStatus(statusKey ? row[statusKey] : "");
  const resolvedMonth = monthInfo || monthInfoFromDate(date) || {
    key: "sem-mes",
    label: "Sem mes",
    sort: 999999,
  };

  if (!description && !category && !amount) return null;

  return {
    description,
    category,
    status,
    amount,
    date,
    monthKey: resolvedMonth.key,
    monthLabel: resolvedMonth.label,
    monthSort: resolvedMonth.sort,
    searchable: normalizeText(`${description} ${category} ${status} ${resolvedMonth.label}`),
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
  const currentValue = select.value;
  select.innerHTML = "";

  const allOption = document.createElement("option");
  allOption.value = "";
  allOption.textContent = allLabel;
  select.appendChild(allOption);

  options.forEach((option) => {
    const element = document.createElement("option");
    element.value = option.value;
    element.textContent = option.label;
    select.appendChild(element);
  });

  if (options.some((option) => option.value === currentValue)) {
    select.value = currentValue;
  }
}

function updateFilters(items) {
  const months = Array.from(
    new Map(items.map((item) => [item.monthKey, { value: item.monthKey, label: item.monthLabel, sort: item.monthSort }])).values()
  ).sort((a, b) => a.sort - b.sort);

  const statuses = Array.from(new Set(items.map((item) => item.status)))
    .sort((a, b) => a.localeCompare(b, "pt-BR"))
    .map((status) => ({ value: status, label: status }));

  const categories = Array.from(new Set(items.map((item) => item.category)))
    .sort((a, b) => a.localeCompare(b, "pt-BR"))
    .map((category) => ({ value: category, label: category }));

  setSelectOptions(getElement("monthFilter"), months, "Todos");
  setSelectOptions(getElement("statusFilter"), statuses, "Todos");
  setSelectOptions(getElement("categoryFilter"), categories, "Todas");
}

function getFilteredItems() {
  const query = normalizeText(getElement("searchInput").value);
  const month = getElement("monthFilter").value;
  const status = getElement("statusFilter").value;
  const category = getElement("categoryFilter").value;

  return state.items.filter((item) => {
    if (query && !item.searchable.includes(query)) return false;
    if (month && item.monthKey !== month) return false;
    if (status && item.status !== status) return false;
    if (category && item.category !== category) return false;
    return true;
  });
}

function aggregateBy(items, keyBuilder) {
  return Array.from(
    items.reduce((map, item) => {
      const key = keyBuilder(item);
      const current = map.get(key.value) || { ...key, amount: 0, count: 0 };
      current.amount += item.amount;
      current.count += 1;
      map.set(key.value, current);
      return map;
    }, new Map()).values()
  );
}

function destroyChart(name) {
  if (state.charts[name]) {
    state.charts[name].destroy();
    state.charts[name] = null;
  }
}

function chartColors() {
  return ["#145da0", "#d97a22", "#198754", "#7b5ea7", "#c43d32", "#6c757d", "#0f766e", "#b45309"];
}

function renderMonthlyChart(items) {
  const grouped = aggregateBy(items, (item) => ({
    value: item.monthKey,
    label: item.monthLabel,
    sort: item.monthSort,
  })).sort((a, b) => a.sort - b.sort);

  const labels = grouped.map((item) => item.label);
  const amounts = grouped.map((item) => item.amount);
  const cumulative = amounts.reduce((list, value, index) => {
    list.push((list[index - 1] || 0) + value);
    return list;
  }, []);

  const total = amounts.reduce((sum, value) => sum + value, 0);
  getElement("monthlyStats").textContent = grouped.length
    ? `${grouped.length} mes(es) exibidos, total de ${formatCurrency(total)}.`
    : "Nenhum mes encontrado nos filtros atuais.";

  destroyChart("monthly");
  state.charts.monthly = new Chart(getElement("monthlyChart"), {
    data: {
      labels,
      datasets: [
        {
          type: "bar",
          label: "Total mensal",
          data: amounts,
          backgroundColor: "rgba(20, 93, 160, 0.82)",
          borderRadius: 6,
        },
        {
          type: "line",
          label: "Acumulado",
          data: cumulative,
          borderColor: "#d97a22",
          backgroundColor: "rgba(217, 122, 34, 0.12)",
          tension: 0.28,
          pointRadius: 4,
          fill: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom" },
        tooltip: {
          callbacks: {
            label: (context) => `${context.dataset.label}: ${formatCurrency(context.parsed.y)}`,
          },
        },
      },
      scales: {
        y: {
          ticks: { callback: (value) => formatCurrency(value) },
          grid: { color: "rgba(102, 117, 138, 0.18)" },
        },
        x: { grid: { display: false } },
      },
    },
  });
}

function renderCategoryChart(items) {
  const grouped = aggregateBy(items, (item) => ({ value: item.category, label: item.category, sort: 0 }))
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
    .slice(0, 10);

  getElement("categoryStats").textContent = grouped.length
    ? `Maior categoria: ${grouped[0].label} (${formatCurrency(grouped[0].amount)}).`
    : "Nenhuma categoria nos filtros atuais.";

  destroyChart("category");
  state.charts.category = new Chart(getElement("categoryChart"), {
    type: "bar",
    data: {
      labels: grouped.map((item) => item.label),
      datasets: [
        {
          label: "Valor",
          data: grouped.map((item) => item.amount),
          backgroundColor: "#198754",
          borderRadius: 6,
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (context) => formatCurrency(context.parsed.x) } },
      },
      scales: {
        x: {
          ticks: { callback: (value) => formatCurrency(value) },
          grid: { color: "rgba(102, 117, 138, 0.18)" },
        },
        y: { grid: { display: false } },
      },
    },
  });
}

function renderStatusChart(items) {
  const grouped = aggregateBy(items, (item) => ({ value: item.status, label: item.status, sort: 0 })).sort((a, b) =>
    a.label.localeCompare(b.label, "pt-BR")
  );

  const paid = grouped.find((item) => item.label === "Pago")?.count || 0;
  const total = items.length || 1;
  getElement("statusStats").textContent = `${paid} de ${items.length} registro(s) pagos (${((paid / total) * 100).toFixed(1)}%).`;

  destroyChart("status");
  state.charts.status = new Chart(getElement("statusChart"), {
    type: "doughnut",
    data: {
      labels: grouped.map((item) => item.label),
      datasets: [
        {
          data: grouped.map((item) => item.count),
          backgroundColor: chartColors(),
          borderWidth: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "62%",
      plugins: {
        legend: { position: "bottom" },
        tooltip: { callbacks: { label: (context) => `${context.label}: ${numberFormatter.format(context.parsed)}` } },
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
    row.innerHTML = '<td colspan="5" class="empty-cell">Nenhum registro encontrado.</td>';
    tbody.appendChild(row);
    return;
  }

  sorted.forEach((item) => {
    const row = document.createElement("tr");
    const statusClass = item.status === "Pago" ? "status-paid" : item.status === "Pendente" ? "status-pending" : "status-other";

    row.innerHTML = `
      <td>${escapeHtml(item.description)}</td>
      <td>${escapeHtml(item.category)}</td>
      <td>${escapeHtml(item.monthLabel)}</td>
      <td><span class="status-pill ${statusClass}">${escapeHtml(item.status)}</span></td>
      <td>${formatCurrency(item.amount)}</td>
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
  const total = items.reduce((sum, item) => sum + item.amount, 0);
  const average = items.length ? total / items.length : 0;
  const currentMonthKey = monthInfoFromDate(new Date()).key;
  const monthTotal = items.filter((item) => item.monthKey === currentMonthKey).reduce((sum, item) => sum + item.amount, 0);
  const paidCount = items.filter((item) => item.status === "Pago").length;
  const pendingCount = items.filter((item) => item.status !== "Pago").length;

  getElement("cardCount").textContent = numberFormatter.format(items.length);
  getElement("cardTotal").textContent = formatCurrency(total);
  getElement("cardMonth").textContent = formatCurrency(monthTotal);
  getElement("cardAverage").textContent = formatCurrency(average);
  getElement("cardPaid").textContent = numberFormatter.format(paidCount);
  getElement("cardPending").textContent = numberFormatter.format(pendingCount);

  renderMonthlyChart(items);
  renderCategoryChart(items);
  renderStatusChart(items);
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
  button.querySelector("span").textContent = isLoading ? "Atualizando" : "Atualizar";
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

function bindEvents() {
  getElement("refreshButton").addEventListener("click", refreshData);
  ["searchInput", "monthFilter", "statusFilter", "categoryFilter"].forEach((id) => {
    getElement(id).addEventListener("input", renderDashboard);
    getElement(id).addEventListener("change", renderDashboard);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  if (window.Chart) {
    Chart.defaults.font.family = 'Inter, "Segoe UI", Arial, sans-serif';
    Chart.defaults.color = "#66758a";
  }

  bindEvents();
  refreshData();
  startAutoRefresh();

  if (window.lucide) {
    window.lucide.createIcons();
  }
});
