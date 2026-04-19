const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('History_test');

db.all("SELECT title, url, visit_count, last_visit_time FROM urls ORDER BY last_visit_time DESC LIMIT 10", (err, rows) => {
    if (err) {
        console.error(err);
    } else {
        console.log(JSON.stringify(rows, null, 2));
    }
    db.close();
});