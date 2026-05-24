const API_URL = 'https://script.google.com/macros/s/AKfycbwhvq8vLL6s2O2uRC1oGMIho1tkko9IgkaINgsd7D9xe55YpC0uBigKQxZbJtpdHST8/exec';

let globalData = {}; 
let currentTab = 'Регіональна'; 
let currentDates = []; 
let chartCost = null;
let chartUtil = null;
let chartLoad = null;

// --- ОБНОВЛЕННЫЙ ПЛАГИН ДЛЯ ГОРИЗОНТАЛЬНЫХ ПОДПИСЕЙ ---
const customDatalabels = {
    id: 'customDatalabels',
    afterDatasetsDraw(chart) {
        const { ctx } = chart;
        ctx.save();
        
        chart.data.datasets.forEach((dataset, datasetIndex) => {
            const meta = chart.getDatasetMeta(datasetIndex);
            if (meta.hidden) return; 
            
            meta.data.forEach((bar, index) => {
                const val = dataset.data[index];
                if (val === null || val === undefined) return;
                
                let text = val % 1 === 0 ? val : Number(val).toFixed(2);
                
                if (chart.canvas.id === 'utilizationChart' || chart.canvas.id === 'loadChart') {
                    text += '%';
                }
                
                ctx.fillStyle = '#94a3b8'; 
                ctx.font = 'bold 10px Segoe UI'; // Аккуратный компактный шрифт
                ctx.textAlign = 'center';        // Выравнивание по центру столбика
                ctx.textBaseline = 'bottom';     // Текст над столбиком
                
                // Рисуем подпись прямо над столбиком
                ctx.fillText(text, bar.x, bar.y - 4);
            });
        });
        ctx.restore();
    }
};

// Регистрация плагина
Chart.register(customDatalabels);

// Настройки темной темы
const darkChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: {
            display: false,
            labels: { color: '#94a3b8', font: { family: 'Segoe UI', size: 11 } }
        }
    },
    scales: {
        x: { ticks: { color: '#94a3b8' }, grid: { color: '#1e293b' } },
        y: { 
            beginAtZero: true, 
            ticks: { color: '#94a3b8' }, 
            grid: { color: '#1e293b' },
            grace: '15%' // Снизили запас сверху до 15% (для горизонтального текста этого с головой)
        }
    }
};

function getChartColors(metric, idx) {
    const palettes = {
        cost: {
            bg: ['rgba(0, 188, 255, 0.6)', 'rgba(0, 102, 204, 0.6)', 'rgba(140, 0, 255, 0.6)', 'rgba(0, 255, 204, 0.6)'],
            border: ['#00bcff', '#0066cc', '#8c00ff', '#00ffcc']
        },
        util: {
            bg: ['rgba(242, 100, 25, 0.6)', 'rgba(219, 68, 85, 0.6)', 'rgba(242, 175, 25, 0.6)', 'rgba(200, 50, 0, 0.6)'],
            border: ['#f26419', '#db4455', '#f2af19', '#c83200']
        },
        load: {
            bg: ['rgba(0, 204, 153, 0.6)', 'rgba(0, 153, 204, 0.6)', 'rgba(102, 204, 0, 0.6)', 'rgba(0, 204, 102, 0.6)'],
            border: ['#00cc99', '#0099cc', '#66cc00', '#00cc66']
        }
    };
    const p = palettes[metric];
    const i = idx % p.bg.length;
    return { bg: p.bg[i], border: p.border[i] };
}

window.onload = function() {
    loadAllData(); 
    
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            currentTab = e.target.dataset.target;
            updateViewForCurrentTab();
        });
    });

    const dropBtn = document.getElementById('dateDropdownBtn');
    const dropContent = document.getElementById('dateFilterContainer');
    
    dropBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropContent.classList.toggle('show');
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.date-dropdown')) {
            dropContent.classList.remove('show');
        }
    });
};

async function loadAllData() {
    document.getElementById('status').innerText = 'Завантаження всіх даних бази...';
    try {
        const response = await fetch(API_URL);
        const result = await response.json();
        if (!result.success) throw new Error(result.error);
        
        globalData = result.data;
        document.getElementById('status').innerText = 'Дані успішно завантажені!';
        setTimeout(() => document.getElementById('status').innerText = '', 2000); 
        
        updateViewForCurrentTab();
    } catch (error) {
        document.getElementById('status').innerText = `Помилка: ${error.message}`;
        console.error(error);
    }
}

function updateViewForCurrentTab() {
    const tabData = globalData[currentTab] || [];
    const container = document.getElementById('dateFilterContainer');
    const dropBtn = document.getElementById('dateDropdownBtn');
    
    if (tabData.length === 0) {
        container.innerHTML = '<div style="padding:8px;color:#666;">Немає даних</div>';
        dropBtn.innerText = 'Немає даних';
        if (chartCost) chartCost.destroy();
        if (chartUtil) chartUtil.destroy();
        if (chartLoad) chartLoad.destroy();
        currentDates = [];
        return;
    }

    const uniqueDates = [...new Set(tabData.map(item => item.date))];
    currentDates = currentDates.filter(d => uniqueDates.includes(d));
    
    if (currentDates.length === 0 && uniqueDates.length > 0) {
        currentDates = [uniqueDates[0]];
    }

    renderDateFilter(uniqueDates);
    renderChartsForDates(currentDates);
}

function formatDisplayDate(dateStr) {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr; 
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}.${month}.${year}`;
}

function renderDateFilter(dates) {
    const container = document.getElementById('dateFilterContainer');
    container.innerHTML = '';
    
    dates.forEach((date) => {
        const label = document.createElement('label');
        label.className = 'date-checkbox-label';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = date;
        checkbox.checked = currentDates.includes(date);
        
        checkbox.onchange = function() {
            let checkedBoxes = Array.from(container.querySelectorAll('input[type="checkbox"]:checked'));
            if (checkedBoxes.length === 0) {
                checkbox.checked = true;
                return;
            }
            currentDates = checkedBoxes.map(cb => cb.value);
            renderChartsForDates(currentDates);
        };
        
        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(formatDisplayDate(date)));
        container.appendChild(label);
    });

    updateDropdownButtonText();
}

function updateDropdownButtonText() {
    const dropBtn = document.getElementById('dateDropdownBtn');
    if (currentDates.length === 1) {
        dropBtn.innerText = formatDisplayDate(currentDates[0]);
    } else {
        dropBtn.innerText = `Обрано дат: ${currentDates.length}`;
    }
}

function renderChartsForDates(targetDates) {
    updateDropdownButtonText();
    
    const tabData = globalData[currentTab] || [];
    const filteredRaw = tabData.filter(item => targetDates.includes(item.date));
    
    const vehicleTypes = [...new Set(filteredRaw.map(i => i.type))];
    const showLegend = targetDates.length > 1; 

    // --- 1. КЛАСТЕРНЫЙ ГРАФИК СТОИМОСТИ ---
    const sortedTypesCost = [...vehicleTypes].sort((a, b) => {
        const avgA = filteredRaw.filter(i => i.type === a).reduce((sum, i) => sum + (Number(i.cost) || 0), 0) / (filteredRaw.filter(i => i.type === a).length || 1);
        const avgB = filteredRaw.filter(i => i.type === b).reduce((sum, i) => sum + (Number(i.cost) || 0), 0) / (filteredRaw.filter(i => i.type === b).length || 1);
        return avgB - avgA;
    });

    const datasetsCost = targetDates.map((date, idx) => {
        const colors = getChartColors('cost', idx);
        return {
            label: formatDisplayDate(date),
            data: sortedTypesCost.map(type => {
                const found = filteredRaw.find(i => i.type === type && i.date === date);
                return found ? found.cost : 0;
            }),
            backgroundColor: colors.bg,
            borderColor: colors.border,
            borderWidth: 1
        };
    });

    const ctxCost = document.getElementById('costChart').getContext('2d');
    if (chartCost) chartCost.destroy();
    const costOptions = JSON.parse(JSON.stringify(darkChartOptions));
    costOptions.plugins.legend.display = showLegend;

    chartCost = new Chart(ctxCost, {
        type: 'bar',
        data: { labels: sortedTypesCost, datasets: datasetsCost },
        options: costOptions
    });

    // --- Проверка наличия утилизации ---
    const hasUtilization = filteredRaw.some(i => i.utilization !== undefined && i.utilization !== null && i.utilization !== '');
    const utilWrapper = document.getElementById('utilizationWrapper');

    // --- 2. КЛАСТЕРНЫЙ ГРАФИК УТИЛИЗАЦИИ ---
    if (hasUtilization) {
        utilWrapper.style.display = 'flex'; 
        
        const sortedTypesUtil = [...vehicleTypes].sort((a, b) => {
            const dataA = filteredRaw.filter(i => i.type === a && i.utilization !== null);
            const dataB = filteredRaw.filter(i => i.type === b && i.utilization !== null);
            const avgA = dataA.reduce((sum, i) => sum + (Number(i.utilization) || 0), 0) / (dataA.length || 1);
            const avgB = dataB.reduce((sum, i) => sum + (Number(i.utilization) || 0), 0) / (dataB.length || 1);
            return avgB - avgA;
        });

        const datasetsUtil = targetDates.map((date, idx) => {
            const colors = getChartColors('util', idx);
            return {
                label: formatDisplayDate(date),
                data: sortedTypesUtil.map(type => {
                    const found = filteredRaw.find(i => i.type === type && i.date === date);
                    return found ? found.utilization : 0;
                }),
                backgroundColor: colors.bg,
                borderColor: colors.border,
                borderWidth: 1
            };
        });

        const ctxUtil = document.getElementById('utilizationChart').getContext('2d');
        if (chartUtil) chartUtil.destroy();
        const utilOptions = JSON.parse(JSON.stringify(darkChartOptions));
        utilOptions.plugins.legend.display = showLegend;

        chartUtil = new Chart(ctxUtil, {
            type: 'bar',
            data: { labels: sortedTypesUtil, datasets: datasetsUtil },
            options: utilOptions
        });
    } else {
        utilWrapper.style.display = 'none'; 
        if (chartUtil) chartUtil.destroy();
    }

    // --- 3. КЛАСТЕРНЫЙ ГРАФИК ЗАГРУЗКИ ---
    const sortedTypesLoad = [...vehicleTypes].sort((a, b) => {
        const avgA = filteredRaw.filter(i => i.type === a).reduce((sum, i) => sum + (Number(i.load) || 0), 0) / (filteredRaw.filter(i => i.type === a).length || 1);
        const avgB = filteredRaw.filter(i => i.type === b).reduce((sum, i) => sum + (Number(i.load) || 0), 0) / (filteredRaw.filter(i => i.type === b).length || 1);
        return avgB - avgA;
    });

    const datasetsLoad = targetDates.map((date, idx) => {
        const colors = getChartColors('load', idx);
        return {
            label: formatDisplayDate(date),
            data: sortedTypesLoad.map(type => {
                const found = filteredRaw.find(i => i.type === type && i.date === date);
                return found ? found.load : 0;
            }),
            backgroundColor: colors.bg,
            borderColor: colors.border,
            borderWidth: 1
        };
    });

    const ctxLoad = document.getElementById('loadChart').getContext('2d');
    if (chartLoad) chartLoad.destroy();
    const loadOptions = JSON.parse(JSON.stringify(darkChartOptions));
    loadOptions.plugins.legend.display = showLegend;

    chartLoad = new Chart(ctxLoad, {
        type: 'bar',
        data: { labels: sortedTypesLoad, datasets: datasetsLoad },
        options: loadOptions
    });
}