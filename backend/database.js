const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'apm_history.db');
const db = new sqlite3.Database(dbPath);

// Initialize DB and create table
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS system_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        cpu_load REAL,
        mem_usage REAL,
        battery REAL
    )`);

    // Check if we need to mock data
    db.get("SELECT COUNT(*) as count FROM system_metrics", (err, row) => {
        if (!err && row.count === 0) {
            console.log("Database is empty. Generating 30 days of mock historical data...");
            generateMockData();
        }
    });
});

// Generate 30 days of historical data (1 entry per hour = 720 entries)
function generateMockData() {
    const stmt = db.prepare("INSERT INTO system_metrics (timestamp, cpu_load, mem_usage, battery) VALUES (?, ?, ?, ?)");
    
    let now = new Date();
    // Go back 30 days
    now.setDate(now.getDate() - 30);
    
    for (let i = 0; i < 30 * 24; i++) { // 30 days * 24 hours
        // Simulate higher usage during day time (hours 9 to 18)
        const hour = now.getHours();
        const isDaytime = hour >= 9 && hour <= 18;
        
        let cpu = isDaytime ? 
            Math.random() * 40 + 20 : // 20-60% during day
            Math.random() * 15 + 5;   // 5-20% at night
            
        let mem = isDaytime ? 
            Math.random() * 30 + 40 : // 40-70% during day
            Math.random() * 20 + 20;  // 20-40% at night

        // Some peak anomalies
        if (Math.random() > 0.95) {
            cpu += 30;
            mem += 20;
        }

        let battery = 100 - (Math.random() * 20); // 80-100%

        // Format timestamp as YYYY-MM-DD HH:MM:SS
        const isoString = now.toISOString().replace('T', ' ').substring(0, 19);
        
        stmt.run(isoString, cpu.toFixed(2), mem.toFixed(2), battery.toFixed(2));
        now.setHours(now.getHours() + 1); // Advance by 1 hour
    }
    stmt.finalize();
    console.log("Mock data generated successfully.");
}

function insertCurrentMetrics(cpu_load, mem_usage, battery) {
    db.run("INSERT INTO system_metrics (cpu_load, mem_usage, battery) VALUES (?, ?, ?)", 
        [cpu_load, mem_usage, battery], 
        (err) => { if(err) console.error("Error inserting metric:", err); }
    );
}

function getHistoricalData(period, callback) {
    let query = "";

    if (period === 'day') {
        query = `
            SELECT strftime('%H:00', timestamp) as label, 
                   AVG(cpu_load) as cpu, AVG(mem_usage) as mem, AVG(battery) as battery 
            FROM system_metrics 
            WHERE timestamp >= datetime('now', '-1 day') 
            GROUP BY strftime('%H', timestamp) 
            ORDER BY timestamp ASC
        `;
    } else if (period === 'week') {
        query = `
            SELECT CASE cast(strftime('%w', timestamp) as integer)
                        WHEN 0 THEN 'Sun' WHEN 1 THEN 'Mon'
                        WHEN 2 THEN 'Tue' WHEN 3 THEN 'Wed'
                        WHEN 4 THEN 'Thu' WHEN 5 THEN 'Fri'
                        WHEN 6 THEN 'Sat' END as label,
                   AVG(cpu_load) as cpu, AVG(mem_usage) as mem, AVG(battery) as battery 
            FROM system_metrics 
            WHERE timestamp >= datetime('now', '-7 days') 
            GROUP BY strftime('%Y-%m-%d', timestamp) 
            ORDER BY timestamp ASC
        `;
    } else if (period === 'month') {
        query = `
            SELECT strftime('%m/%d', timestamp) as label, 
                   AVG(cpu_load) as cpu, AVG(mem_usage) as mem, AVG(battery) as battery 
            FROM system_metrics 
            WHERE timestamp >= datetime('now', '-30 days') 
            GROUP BY strftime('%Y-%m-%d', timestamp) 
            ORDER BY timestamp ASC
        `;
    } else {
        return callback("Invalid period", null);
    }

    db.all(query, (err, rows) => {
        if (err) return callback(err, null);
        
        let peakDataRow = null;
        let peakBatteryRow = null;

        if (rows.length > 0) {
            // Highest CPU+MEM implies Peak Data/Usage
            peakDataRow = rows.reduce((max, r) => (r.cpu + r.mem) > (max.cpu + max.mem) ? r : max, rows[0]);
            // Lowest Battery implies Peak Battery Drain
            peakBatteryRow = rows.reduce((min, r) => r.battery < min.battery ? r : min, rows[0]);
        }

        const data = {
            labels: rows.map(r => r.label),
            cpu: rows.map(r => r.cpu.toFixed(1)),
            mem: rows.map(r => r.mem.toFixed(1)),
            peakDataTime: peakDataRow ? peakDataRow.label : 'N/A',
            peakBatteryTime: peakBatteryRow ? peakBatteryRow.label : 'N/A'
        };
        callback(null, data);
    });
}

module.exports = {
    insertCurrentMetrics,
    getHistoricalData
};
