const path = require('path');
const Database = require(path.join(__dirname, 'trend-video-frontend', 'node_modules', 'better-sqlite3'));

const dbPath = path.join(__dirname, 'trend-video-frontend', 'data', 'database.sqlite');
const db = new Database(dbPath);

console.log('=== Testing getAllVideoTitles query ===\n');

const titles = db.prepare(`
  SELECT
    t.id,
    t.title,
    t.status as title_status,
    COALESCE(s.status, t.status) as status,
    s.id as schedule_id,
    s.status as schedule_status
  FROM video_titles t
  LEFT JOIN (
    SELECT title_id, id, status,
           ROW_NUMBER() OVER (PARTITION BY title_id ORDER BY created_at DESC) as rn
    FROM video_schedules
  ) s ON t.id = s.title_id AND s.rn = 1
  WHERE t.status = 'waiting_for_upload'
  LIMIT 10
`).all();

console.log('waiting_for_upload titles from query:');
console.log('Count:', titles.length);
titles.forEach(t => {
  console.log(`- ${t.id}`);
  console.log(`  title_status: ${t.title_status}`);
  console.log(`  schedule_status: ${t.schedule_status || 'NULL'}`);
  console.log(`  COALESCE status: ${t.status}`);
});

console.log('\n=== Filtering by status ===');
const waitingCount = titles.filter(t => t.status === 'waiting_for_upload').length;
console.log(`Titles with status='waiting_for_upload': ${waitingCount}`);

const processingCount = titles.filter(t => t.status === 'processing').length;
console.log(`Titles with status='processing': ${processingCount}`);

db.close();
