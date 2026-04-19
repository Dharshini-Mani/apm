const si = require('systeminformation');

async function checkChrome() {
    const processes = await si.processes();
    const chromeProcs = processes.list.filter(p => p.name.toLowerCase().includes('chrome.exe'));
    
    console.log(JSON.stringify(chromeProcs.slice(0, 5).map(p => ({
        pid: p.pid,
        command: p.command,
        params: p.params
    })), null, 2));
}

checkChrome();