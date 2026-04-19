/**
 * APM System Dashboard Logic
 * Handles mock data generation and UI updates for system performance monitoring.
 */

const AppMonitor = {
    apps: [],
    websites: [],
    apiUrl: window.location.protocol === 'file:' ? 'http://localhost:3001/api' : '/api',


    chart: null,
    historySize: 20,
    history: { cpu: [], mem: [], labels: [] },
    notifiedWebsites: new Set(),

    async init() {
        // Auth Check
        if (!localStorage.getItem('apm_token')) {
            window.location.href = 'login.html';
            return;
        }

        // Request notification permission
        if (window.Notification && Notification.permission !== 'denied' && Notification.permission !== 'granted') {
            Notification.requestPermission();
        }

        this.loadSettings();

        this.currentPeriod = 'live';
        this.currentAppPeriod = 'live';
        this.initChart();
        await this.syncData();
        this.startLiveSync();
        this.setupEventListeners();
        this.initBattery();
    },

    initChart() {
        const ctx = document.getElementById('performanceChart').getContext('2d');
        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: this.history.labels,
                datasets: [
                    {
                        label: 'CPU Load (%)',
                        data: this.history.cpu,
                        borderColor: '#00f2ff',
                        backgroundColor: 'rgba(0, 242, 255, 0.1)',
                        fill: true,
                        tension: 0.4,
                        borderWidth: 2,
                        pointRadius: 0
                    },
                    {
                        label: 'RAM Usage (%)',
                        data: this.history.mem,
                        borderColor: '#ff2d55',
                        backgroundColor: 'rgba(255, 45, 85, 0.1)',
                        fill: true,
                        tension: 0.4,
                        borderWidth: 2,
                        pointRadius: 0
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { 
                        beginAtZero: true, 
                        max: 100,
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: { color: 'rgba(255, 255, 255, 0.5)' }
                    },
                    x: { 
                        display: false 
                    }
                },
                plugins: {
                    legend: { display: false }
                },
                animation: { duration: 800 }
            }
        });
    },

    async syncData() {
        try {
            const [metricsRes, appsRes, chromeRes, networkRes] = await Promise.all([
                fetch(`${this.apiUrl}/metrics`),
                fetch(`${this.apiUrl}/apps?period=${this.currentAppPeriod}`),
                fetch(`${this.apiUrl}/chrome`),
                fetch(`${this.apiUrl}/network`)
            ]);

            const metrics = await metricsRes.json();
            this.apps = await appsRes.json();
            const chromeData = await chromeRes.json();
            const networkData = await networkRes.json();

            this.updateGlobalMetrics(metrics);
            
            // Only update live chart if we are in 'live' mode
            if (this.currentPeriod === 'live') {
                this.updateChart(metrics);
                document.getElementById('peak-data-time').textContent = 'Live Monitoring';
                document.getElementById('peak-battery-time').textContent = 'Live Monitoring';
            }
            
            this.renderApps();
            this.renderChromeIntel(chromeData);
            this.renderNetwork(networkData);
        } catch (error) {
            console.error('Failed to sync with backend:', error);
        }
    },

    renderChromeIntel(data) {
        if (!data) return;

        // Update stats
        document.getElementById('chrome-proc-count').textContent = data.count || 0;
        document.getElementById('chrome-total-mem').textContent = `${data.totalMemoryMb || 0} MB`;
        document.getElementById('chrome-status-text').textContent = (data.count > 0) ? `Active: ${data.tabCount} Tabs Monitoring` : 'Chrome is Closed';

        // Render Activities (Active Sites)
        const procList = document.getElementById('chrome-process-list');
        const activities = data.activities || [];
        procList.innerHTML = activities.length ? activities.map(a => `
            <tr>
                <td>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span style="font-size: 1.2rem;">${a.icon}</span>
                        <div>
                            <div style="font-weight: 600; color: var(--accent-cyan);">${a.name}</div>
                            <span style="font-size: 0.75rem; color: var(--text-secondary)">${a.count > 1 ? a.count + ' Processes' : 'Active Tab'}</span>
                        </div>
                    </div>
                </td>
                <td>${a.timeUsed}</td>
                <td>${a.mem} MB</td>
                <td><span class="status-badge" style="background: ${parseFloat(a.mem) > 300 ? 'rgba(255,45,85,0.1)' : 'rgba(0,255,170,0.1)'}; color: ${parseFloat(a.mem) > 300 ? 'var(--accent-rose)' : 'var(--accent-emerald)'}">${a.status}</span></td>
            </tr>
        `).join('') : '<tr><td colspan="4" style="text-align:center; padding: 2rem;">No active tabs detected</td></tr>';

        // Check for notifications
        const alertsEnabled = document.getElementById('realtime-alert-toggle') && document.getElementById('realtime-alert-toggle').checked;
        if (alertsEnabled && activities.length > 0) {
            activities.forEach(a => {
                const mem = parseFloat(a.mem);
                const notificationKey = mem > 300 ? a.name + '-high' : a.name;
                
                if (!this.notifiedWebsites.has(notificationKey)) {
                    this.notifiedWebsites.add(notificationKey);
                    
                    if (mem > 300) {
                        this.showNotification('High RAM Usage Alert', `${a.name} is consuming heavy memory (${a.mem} MB). Consider closing some tabs.`, true, a.icon);
                    } else if (!this.notifiedWebsites.has(a.name + '-high')) {
                        // Just a normal active notification
                        this.showNotification('Website Active', `${a.name} is currently running (${a.mem} MB).`, false, a.icon);
                    }
                    
                    // Allow normal notifications to re-trigger after some time, but keep high-ram blocked longer
                    setTimeout(() => {
                        this.notifiedWebsites.delete(notificationKey);
                    }, mem > 300 ? 60000 : 30000); 
                }
            });
        }

        // Render History
        const histList = document.getElementById('chrome-history-list');
        const history = data.history || [];
        histList.innerHTML = history.length ? history.map(h => `
            <tr>
                <td>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span style="font-size: 1.2rem;">${h.icon}</span>
                        <div>
                            <div style="font-weight: 600; color: var(--accent-cyan);">${h.name}</div>
                            <span class="history-url" title="${h.fullTitle}">${h.fullTitle}</span>
                        </div>
                    </div>
                </td>
                <td><span class="status-badge">${h.time || 'Recent'}</span></td>
            </tr>
        `).join('') : '<tr><td colspan="2" style="text-align:center; padding: 2rem;">No history available</td></tr>';
    },

    renderNetwork(data) {
        if (!data) return;
        document.getElementById('net-connections').textContent = data.activeConnections || 0;
        document.getElementById('net-latency').innerHTML = `${data.latency || 0} <small>ms</small>`;

        const netList = document.getElementById('network-interfaces');
        const interfaces = data.interfaces || [];
        netList.innerHTML = interfaces.length ? interfaces.map(i => `
            <tr>
                <td style="font-weight: 600; color: var(--accent-cyan);">${i.name}</td>
                <td><span class="status-badge" style="background: ${i.status === 'Connected' ? 'rgba(0,255,170,0.1)' : 'rgba(255,255,255,0.1)'}; color: ${i.status === 'Connected' ? 'var(--accent-emerald)' : 'var(--text-secondary)'}">${i.status}</span></td>
                <td>${i.ip || 'N/A'}</td>
                <td>${i.speed || 'N/A'}</td>
            </tr>
        `).join('') : '<tr><td colspan="4" style="text-align:center; padding: 2rem;">No interfaces found</td></tr>';
    },

    updateChart(metrics) {
        const time = new Date().toLocaleTimeString();
        this.history.labels.push(time);
        this.history.cpu.push(metrics.cpuLoad);
        this.history.mem.push(metrics.memUsage);

        if (this.history.labels.length > this.historySize) {
            this.history.labels.shift();
            this.history.cpu.shift();
            this.history.mem.shift();
        }

        this.chart.update('none');
    },

    async fetchHistoricalData(period) {
        try {
            const res = await fetch(`${this.apiUrl}/history?period=${period}`);
            const data = await res.json();
            
            // Update chart data with historical dataset
            this.chart.data.labels = data.labels;
            this.chart.data.datasets[0].data = data.cpu;
            this.chart.data.datasets[1].data = data.mem;
            this.chart.update();

            document.getElementById('peak-data-time').textContent = data.peakDataTime;
            document.getElementById('peak-battery-time').textContent = data.peakBatteryTime;
        } catch(e) {
            console.error("Failed to fetch historical data", e);
        }
    },

    updateGlobalMetrics(metrics) {
        document.getElementById('total-data').innerHTML = `${metrics.totalData} <small>GB</small>`;
        document.getElementById('avg-timing').innerHTML = `${metrics.avgTiming} <small>ms</small>`;
        document.getElementById('energy-drain').innerHTML = `${metrics.energyDrain} <small>GB</small>`; // Changed to GB for memory visibility
        
        // Update battery if not using real API (now backend provides real data)
        document.getElementById('battery-pct').textContent = `${metrics.battery}%`;
        document.getElementById('charging-status').textContent = metrics.isCharging ? 'Charging' : 'Discharging';
    },

    renderApps() {
        const list = document.getElementById('app-usage-list');
        list.innerHTML = this.apps.map(app => `
            <div class="app-item">
                <div class="app-icon">${app.icon}</div>
                <div class="app-info">
                    <div class="app-name">${app.name}</div>
                    <div class="app-meta">Process ID: ${app.pid}</div>
                </div>
                <div class="app-data"><strong>${app.data}</strong></div>
                <div class="app-timing">${app.timing}</div>
                <div class="app-battery">${app.battery}</div>
                <div><span class="status-badge" style="background: ${this.getStatusColor(app.status)}1a; color: ${this.getStatusColor(app.status)}">${app.status}</span></div>
            </div>
        `).join('');
    },


    getStatusColor(status) {
        switch(status) {
            case 'Active':
            case 'Efficient':
            case 'Optimized': return '#00ffaa';
            case 'High Usage':
            case 'Heavy': return '#ffaa00';
            case 'Critical':
            case 'High Drain': return '#ff2d55';
            default: return '#ffffff';
        }
    },

    showNotification(title, message, isHighDanger = false, icon = '🔔') {
        const container = document.getElementById('toast-container');
        if (container) {
            const toast = document.createElement('div');
            toast.className = `toast ${isHighDanger ? 'toast-high-ram' : ''}`;
            
            toast.innerHTML = `
                <div class="toast-icon">${icon}</div>
                <div class="toast-content">
                    <h4>${title}</h4>
                    <p>${message}</p>
                </div>
            `;

            container.appendChild(toast);

            // Remove toast after 5 seconds
            setTimeout(() => {
                toast.classList.add('fade-out');
                setTimeout(() => {
                    if (container.contains(toast)) {
                        container.removeChild(toast);
                    }
                }, 500); // 500ms matches CSS fadeOut animation
            }, 5000);
        }

        // Native Chrome/Desktop Notification for cross-tab alerts
        const realtimeAlertsObj = document.getElementById('realtime-alert-toggle');
        if (realtimeAlertsObj && realtimeAlertsObj.checked && window.Notification && Notification.permission === 'granted') {
            new Notification(title, {
                body: message,
                icon: 'https://www.google.com/chrome/static/images/chrome-logo.svg',
                tag: title
            });
        }
    },

    startLiveSync() {
        this.syncInterval = setInterval(() => this.syncData(), parseInt(document.getElementById('refresh-rate') ? document.getElementById('refresh-rate').value : 3000));
    },

    initBattery() {
        if (navigator.getBattery) {
            navigator.getBattery().then(battery => {
                const updateBattery = () => {
                    document.getElementById('battery-pct').textContent = `${Math.round(battery.level * 100)}%`;
                    document.getElementById('charging-status').textContent = battery.charging ? 'Charging' : 'Discharging';
                    document.getElementById('charging-status').style.background = battery.charging ? 'rgba(0, 255, 170, 0.15)' : 'rgba(255, 255, 255, 0.1)';
                    document.getElementById('charging-status').style.color = battery.charging ? 'var(--accent-emerald)' : 'var(--text-secondary)';
                };
                updateBattery();
                battery.addEventListener('levelchange', updateBattery);
                battery.addEventListener('chargingchange', updateBattery);
            });
        }
    },

    setupEventListeners() {
        const searchInput = document.getElementById('main-search');
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            const items = document.querySelectorAll('.app-item');
            items.forEach(item => {
                const name = item.querySelector('.app-name').textContent.toLowerCase();
                item.style.display = name.includes(term) ? 'grid' : 'none';
            });
        });

        // Chrome Tabs Logic
        document.querySelectorAll('.chrome-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.chrome-tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.chrome-tab-content').forEach(c => c.classList.remove('active'));
                
                btn.classList.add('active');
                document.getElementById(btn.dataset.tab).classList.add('active');
            });
        });

        document.querySelectorAll('.nav-links a').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                // Update active nav item
                document.querySelectorAll('.nav-links li').forEach(li => li.classList.remove('active'));
                link.parentElement.classList.add('active');
                
                // Switch views
                const targetViewId = link.getAttribute('data-target');
                document.querySelectorAll('.tab-view').forEach(view => {
                    view.style.display = 'none';
                    view.classList.remove('active');
                });
                
                const targetView = document.getElementById(targetViewId);
                if (targetView) {
                    targetView.style.display = 'block';
                    setTimeout(() => targetView.classList.add('active'), 50);
                }
            });
        });

        // Historical Chart Toggle Buttons
        document.querySelectorAll('.history-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.history-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                this.currentPeriod = btn.dataset.period;
                
                if (this.currentPeriod === 'live') {
                    // Reset to live history buffer
                    this.chart.data.labels = this.history.labels;
                    this.chart.data.datasets[0].data = this.history.cpu;
                    this.chart.data.datasets[1].data = this.history.mem;
                    this.chart.update();
                    document.getElementById('peak-data-time').textContent = 'Live Monitoring';
                    document.getElementById('peak-battery-time').textContent = 'Live Monitoring';
                } else {
                    // Fetch block of historical data
                    this.fetchHistoricalData(this.currentPeriod);
                }
            });
        });

        // Application Period Toggle Buttons
        document.querySelectorAll('.app-period-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                document.querySelectorAll('.app-period-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                this.currentAppPeriod = btn.dataset.period;
                // Instantly fetch and update just the apps list so it's snappy
                try {
                    const appsRes = await fetch(`${this.apiUrl}/apps?period=${this.currentAppPeriod}`);
                    this.apps = await appsRes.json();
                    this.renderApps();
                } catch (err) {
                    console.error('Failed to switch apps period', err);
                }
            });
        });

        // Settings Listeners
        const saveAndApplyTheme = (e) => {
            this.applyTheme(e.target.value);
            this.saveSettings();
        };
        document.getElementById('theme-select').addEventListener('change', saveAndApplyTheme);

        document.getElementById('refresh-rate').addEventListener('change', (e) => {
            clearInterval(this.syncInterval);
            this.syncInterval = setInterval(() => this.syncData(), parseInt(e.target.value));
            this.saveSettings();
        });

        // Add change listener to all toggles to save settings
        document.querySelectorAll('.settings-grid input[type="checkbox"]').forEach(toggle => {
            toggle.addEventListener('change', () => this.saveSettings());
        });

        document.getElementById('logout-btn').addEventListener('click', () => {
            localStorage.removeItem('apm_token');
            window.location.href = 'login.html';
        });
    },

    loadSettings() {
        const defaultSettings = {
            theme: 'dark',
            bgAnimation: true,
            compactMode: false,
            refreshRate: '3000',
            graphPause: true,
            realtimeAlerts: true,
            cpuAlerts: true,
            batteryAlerts: false,
            timeout: true
        };
        
        let saved = defaultSettings;
        try {
            const ls = localStorage.getItem('apm_settings');
            if (ls) {
                saved = JSON.parse(ls) || defaultSettings;
            }
        } catch (e) {
            console.warn('Failed to parse settings', e);
        }
        
        if(document.getElementById('theme-select')) document.getElementById('theme-select').value = saved.theme || 'dark';
        if(document.getElementById('bg-animation-toggle')) document.getElementById('bg-animation-toggle').checked = saved.bgAnimation !== false;
        if(document.getElementById('compact-mode-toggle')) document.getElementById('compact-mode-toggle').checked = saved.compactMode || false;
        if(document.getElementById('refresh-rate')) document.getElementById('refresh-rate').value = saved.refreshRate || '3000';
        if(document.getElementById('graph-pause-toggle')) document.getElementById('graph-pause-toggle').checked = saved.graphPause !== false;
        if(document.getElementById('realtime-alert-toggle')) document.getElementById('realtime-alert-toggle').checked = saved.realtimeAlerts !== false;
        if(document.getElementById('cpu-alert-toggle')) document.getElementById('cpu-alert-toggle').checked = saved.cpuAlerts !== false;
        if(document.getElementById('battery-alert-toggle')) document.getElementById('battery-alert-toggle').checked = saved.batteryAlerts || false;
        if(document.getElementById('timeout-toggle')) document.getElementById('timeout-toggle').checked = saved.timeout !== false;

        this.applyTheme(saved.theme || 'dark');
    },

    saveSettings() {
        const settings = {
            theme: document.getElementById('theme-select').value,
            bgAnimation: document.getElementById('bg-animation-toggle').checked,
            compactMode: document.getElementById('compact-mode-toggle').checked,
            refreshRate: document.getElementById('refresh-rate').value,
            graphPause: document.getElementById('graph-pause-toggle').checked,
            realtimeAlerts: document.getElementById('realtime-alert-toggle').checked,
            cpuAlerts: document.getElementById('cpu-alert-toggle').checked,
            batteryAlerts: document.getElementById('battery-alert-toggle').checked,
            timeout: document.getElementById('timeout-toggle').checked
        };
        localStorage.setItem('apm_settings', JSON.stringify(settings));
    },

    applyTheme(theme) {
        if (theme === 'light') {
            document.documentElement.style.setProperty('--bg-dark', '#f4f7f6');
            document.documentElement.style.setProperty('--bg-panel', '#ffffff');
            document.documentElement.style.setProperty('--text-primary', '#1e293b');
            document.documentElement.style.setProperty('--text-secondary', '#64748b');
        } else {
            document.documentElement.style.setProperty('--bg-dark', '#0a0d14');
            document.documentElement.style.setProperty('--bg-panel', '#141a24');
            document.documentElement.style.setProperty('--text-primary', '#e2e8f0');
            document.documentElement.style.setProperty('--text-secondary', '#94a3b8');
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    AppMonitor.init();
});