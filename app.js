const sheetCsvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vStSGzixWpI1OvPxRAhv4HC33dNCJ3p4Yk4c2dnJLM43FiwcrIqe79z8HJcVahSXTA3pkQ1xZ1qttRH/pub?gid=433514608&single=true&output=csv';

let barChart = null;
let donutChart = null;
let lineChart = null;
let performanceChart = null;

function normalizeKey(k) {
  return (k || '').toString().trim().toLowerCase();
}

function findKey(keys, candidates) {
  for (const candidate of candidates) {
    const found = keys.find(k => normalizeKey(k).includes(candidate));
    if (found) return found;
  }
  return null;
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function buildStatusLabel(status) {
  if (!status) return 'Pendente';
  return status.toLowerCase().includes('pago') ? 'Pago' : 'Pendente';
}

function safeDestroy(chart) {
  if (chart && typeof chart.destroy === 'function') {
    chart.destroy();
  }
}

function renderData(rows) {
  if (!rows || rows.length === 0) {
    alert('Planilha vazia ou não disponível. Verifique permissões/publicação.');
    return;
  }

  const keys = Object.keys(rows[0]);
  const descKey = findKey(keys, ['descr', 'description', 'titulo', 'item', 'name']);
  const categoryKey = findKey(keys, ['categoria', 'category', 'tipo', 'segmento', 'grupo']);
  const amountKey = findKey(keys, ['valor', 'amount', 'value', 'total', 'price']);
  const statusKey = findKey(keys, ['status', 'pago', 'estado']);
  const dateKey = findKey(keys, ['data', 'date']);

  const parsed = rows.map(row => ({
    desc: descKey ? row[descKey] : 'Item',
    category: categoryKey ? row[categoryKey] : null,
    amount: amountKey ? parseFloat((row[amountKey] || '').toString().replace(/[^0-9-,.]/g, '').replace(/,/g, '.')) || 0 : 0,
    status: statusKey ? (row[statusKey] || '').toString().trim().toLowerCase() : '',
    date: dateKey ? new Date(row[dateKey]) : null
  })).filter(item => item.amount !== 0 || item.desc);

  const totalItems = parsed.length;
  const now = new Date();
  const monthSum = parsed.reduce((sum, item) => {
    if (item.date && item.date.getMonth() === now.getMonth() && item.date.getFullYear() === now.getFullYear()) {
      return sum + item.amount;
    }
    return sum;
  }, 0);
  const balance = parsed.reduce((sum, item) => sum + item.amount, 0);
  const paidCount = parsed.filter(item => item.status.includes('pago')).length;
  const pendingCount = totalItems - paidCount;

  const averageValue = totalItems > 0 ? balance / totalItems : 0;
  const uniqueDates = [...new Set(parsed.filter(item => item.date && !isNaN(item.date)).map(item => item.date.toISOString().slice(0,10)))];
  const dailyAverage = uniqueDates.length > 0 ? parsed.reduce((sum, item) => sum + item.amount, 0) / uniqueDates.length : 0;

  document.getElementById('card-count').innerText = totalItems;
  document.getElementById('card-month').innerText = formatCurrency(monthSum);
  document.getElementById('card-balance').innerText = formatCurrency(balance);
  document.getElementById('card-average').innerText = formatCurrency(averageValue);
  document.getElementById('card-paid').innerText = paidCount;
  document.getElementById('card-pending').innerText = pendingCount;
  document.getElementById('summaryDailyAverage').innerText = formatCurrency(dailyAverage);
  document.getElementById('lastUpdate').innerText = `Última atualização: ${now.toLocaleString('pt-BR')}`;

  const categoryMap = parsed.reduce((map, item) => {
    const category = item.category || item.desc || 'Outros';
    map[category] = (map[category] || 0) + item.amount;
    return map;
  }, {});
  const sortedCategories = Object.entries(categoryMap)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10);
  const categoryLabels = sortedCategories.map(([label]) => label);
  const categoryValues = sortedCategories.map(([, value]) => value);

  document.getElementById('summaryCategoryCount').innerText = sortedCategories.length;

  const categoryList = sortedCategories.slice(0, 3).map(([name, value]) => `${name}: ${formatCurrency(value)}`).join(' • ') || 'Sem categorias definidas';
  document.getElementById('categoryStats').innerText = `Top categorias: ${categoryList}`;

  const statusMap = parsed.reduce((map, item) => {
    const label = buildStatusLabel(item.status);
    map[label] = (map[label] || 0) + 1;
    return map;
  }, {});
  const statusLabels = ['Pago', 'Pendente'];
  const statusValues = [statusMap['Pago'] || 0, statusMap['Pendente'] || 0];

  const categoryByAmount = sortedCategories.map(([category, amount]) => ({
    category,
    amount,
    percentage: balance !== 0 ? (amount / balance) * 100 : 0
  }));

  const topCategory = categoryByAmount[0] || { category: 'Nenhuma', amount: 0, percentage: 0 };
  document.getElementById('summaryTopCategory').innerText = `${topCategory.category} — ${formatCurrency(topCategory.amount)} (${topCategory.percentage.toFixed(1)}%)`;

  const pendingRows = parsed.filter(item => buildStatusLabel(item.status) === 'Pendente');
  const tbody = document.querySelector('#dataTable tbody');
  tbody.innerHTML = '';

  if (pendingRows.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="3" style="text-align:center;color:#6f7d95;padding:18px">Nenhuma conta pendente encontrada.</td>`;
    tbody.appendChild(tr);
  } else {
    pendingRows.slice(0, 50).forEach(item => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${item.desc}</td><td>${buildStatusLabel(item.status)}</td><td>${formatCurrency(item.amount)}</td>`;
      tbody.appendChild(tr);
    });
  }

  const dailyAmounts = parsed.reduce((map, item) => {
    if (!item.date || isNaN(item.date)) return map;
    const day = item.date.toISOString().slice(0, 10);
    map[day] = (map[day] || 0) + item.amount;
    return map;
  }, {});
  const sortedDates = Object.keys(dailyAmounts).sort();
  const cumulativeValues = [];
  sortedDates.reduce((sum, day) => {
    const next = sum + dailyAmounts[day];
    cumulativeValues.push(next);
    return next;
  }, 0);

  safeDestroy(barChart);
  safeDestroy(donutChart);
  safeDestroy(lineChart);
  safeDestroy(performanceChart);

  const barCtx = document.getElementById('barChart').getContext('2d');
  barChart = new Chart(barCtx, {
    type: 'bar',
    data: {
      labels: categoryLabels,
      datasets: [{
        label: 'Valor por categoria',
        data: categoryValues,
        backgroundColor: '#09375f',
        borderRadius: 12,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: context => formatCurrency(context.parsed.y) } }
      },
      scales: {
        x: { ticks: { color: '#44596f' } },
        y: { ticks: { color: '#44596f', callback: value => formatCurrency(value) } }
      }
    }
  });

  const donutCtx = document.getElementById('donutChart').getContext('2d');
  donutChart = new Chart(donutCtx, {
    type: 'doughnut',
    data: {
      labels: statusLabels,
      datasets: [{
        data: statusValues,
        backgroundColor: ['#09375f', '#f6a455'],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: '#44596f' } }
      }
    }
  });

  const performanceCtx = document.getElementById('performanceChart').getContext('2d');
  const topCategoriesForPerf = sortedCategories.slice(0, 5).map(([name, value]) => ({
    name,
    value,
    paidPercentage: parsed.filter(p => (p.category || p.desc) === name && p.status.includes('pago')).length / parsed.filter(p => (p.category || p.desc) === name).length * 100 || 0
  }));
  performanceChart = new Chart(performanceCtx, {
    type: 'bar',
    data: {
      labels: topCategoriesForPerf.map(c => c.name),
      datasets: [{
        label: 'Taxa de recebimento (%)',
        data: topCategoriesForPerf.map(c => c.paidPercentage),
        backgroundColor: '#f6a455',
        borderRadius: 12
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: {
        legend: { display: true },
        tooltip: { callbacks: { label: context => context.parsed.x.toFixed(1) + '%' } }
      },
      scales: {
        x: { ticks: { color: '#44596f', callback: v => v + '%' }, max: 100 },
        y: { ticks: { color: '#44596f' } }
      }
    }
  });

  const lineCtx = document.getElementById('lineChart').getContext('2d');
  lineChart = new Chart(lineCtx, {
    type: 'line',
    data: {
      labels: sortedDates,
      datasets: [{
        label: 'Tendência de caixa',
        data: cumulativeValues,
        borderColor: '#09375f',
        backgroundColor: 'rgba(9,55,95,0.08)',
        fill: true,
        tension: 0.3,
        pointRadius: 4,
        pointBackgroundColor: '#09375f'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: { ticks: { color: '#44596f' } },
        y: { ticks: { color: '#44596f', callback: value => formatCurrency(value) } }
      }
    }
  });
}

const AUTO_REFRESH_SECONDS = 10;
let autoRefreshTimer = null;
let countdownTimer = null;
let countdownRemaining = AUTO_REFRESH_SECONDS;

function setRefreshState(isRefreshing) {
  const button = document.getElementById('refreshButton');
  if (!button) return;
  button.disabled = isRefreshing;
  button.innerText = isRefreshing ? 'Atualizando...' : 'Atualizar dados';
}

function setCountdownText(value) {
  const countdown = document.getElementById('refreshCountdown');
  if (countdown) {
    countdown.innerText = `Próxima atualização em ${value}s`;
  }
}

function startRefreshCountdown() {
  stopRefreshCountdown();
  countdownRemaining = AUTO_REFRESH_SECONDS;
  setCountdownText(countdownRemaining);

  countdownTimer = setInterval(() => {
    countdownRemaining -= 1;
    if (countdownRemaining <= 0) {
      setCountdownText(0);
      stopRefreshCountdown();
      return;
    }
    setCountdownText(countdownRemaining);
  }, 1000);
}

function stopRefreshCountdown() {
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
}

function updateDashboard() {
  setRefreshState(true);
  const cacheBustedUrl = `${sheetCsvUrl}&t=${Date.now()}`;
  Papa.parse(cacheBustedUrl, {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: results => {
      renderData(results.data);
      setRefreshState(false);
      startRefreshCountdown();
    },
    error: () => {
      alert('Erro ao carregar a planilha. Verifique a URL e as permissões.');
      setRefreshState(false);
    }
  });
}

function startAutoRefresh() {
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer);
  }
  autoRefreshTimer = setInterval(updateDashboard, AUTO_REFRESH_SECONDS * 1000);
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('refreshButton').addEventListener('click', updateDashboard);
  updateDashboard();
  startRefreshCountdown();
  startAutoRefresh();
});
