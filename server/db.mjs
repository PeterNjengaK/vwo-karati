import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
export function openDatabase(path = process.env.DATABASE_PATH || './data/church.sqlite') {
  if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','registrar')), active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id), csrf TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS members(id TEXT PRIMARY KEY, data TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS content(id TEXT PRIMARY KEY, kind TEXT NOT NULL, data TEXT NOT NULL, published INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, category TEXT NOT NULL, message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new', created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS donations(id TEXT PRIMARY KEY, request_key TEXT UNIQUE NOT NULL, phone TEXT NOT NULL, amount INTEGER NOT NULL, purpose TEXT NOT NULL, mode TEXT NOT NULL, status TEXT NOT NULL, checkout TEXT UNIQUE, receipt TEXT, note TEXT, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL, target TEXT, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS limits(key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS media(id TEXT PRIMARY KEY, mime TEXT NOT NULL, bytes BLOB NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS services(id TEXT PRIMARY KEY, title TEXT NOT NULL, service_date TEXT NOT NULL, visitors INTEGER NOT NULL DEFAULT 0, notes TEXT NOT NULL DEFAULT '', version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS attendance(service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE, member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE, checked_at TEXT NOT NULL, PRIMARY KEY(service_id,member_id));
    CREATE TABLE IF NOT EXISTS care_tasks(id TEXT PRIMARY KEY, title TEXT NOT NULL, member_id TEXT REFERENCES members(id) ON DELETE SET NULL, assigned_to TEXT REFERENCES users(id), due_date TEXT NOT NULL, priority TEXT NOT NULL, status TEXT NOT NULL, notes TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS attendance_member ON attendance(member_id);
    CREATE INDEX IF NOT EXISTS services_date ON services(service_date);
    CREATE INDEX IF NOT EXISTS care_due ON care_tasks(due_date,status);
  `);
  const settings = {
    name: 'VWO Karati', tagline: 'A place to belong. A faith to live.',
    welcome: 'We are a Christ-centered community growing in faith, sharing life, and serving our neighbours. Wherever you are on your journey, there is a place for you here.',
    mission: 'To lead people into a transformative relationship with Jesus Christ through worship, teaching, community, and service.',
    story: 'VWO Karati Church was founded on the belief that faith should be lived boldly, inclusively, and joyfully. We are rooted in Scripture, empowered by the Holy Spirit, and committed to walking in the way of Jesus.',
    address: 'Karati, Naivasha, Kenya', email: 'vwokarati@gmail.com', phone: '',
    service_times: 'Contact us for this week’s service times.', youtube: 'https://www.youtube.com/@vwo_karati',
    facebook: 'https://www.facebook.com/vwokarati', tiktok: 'https://www.tiktok.com/@vwo.karati'
  };
  const fresh=!db.prepare('SELECT id FROM settings WHERE id=1').get();
  db.prepare('INSERT OR IGNORE INTO settings VALUES(1,?)').run(JSON.stringify(settings));
  const ministries = [
    ['men', 'Men’s Ministry', 'Grow strong spiritual roots through Scripture, fellowship, and serving together.', '3.jpg'],
    ['women', 'Women’s Mentorship', 'Encouragement, friendship, and guidance for every season of life.', '1.jpg'],
    ['youth', 'Children & Youth', 'A joyful place for young people to discover faith, friendship, and their God-given gifts.', '3.jpg'],
    ['outreach', 'Outreach & Evangelism', 'Sharing the love of Christ through practical care for our neighbours.', '4.jpg'],
    ['creative', 'Creative Arts', 'Express your faith through music, dance, drama, and media.', '5.jpg']
  ];
  if(fresh) {
    for (const [id,title,description,image] of ministries) db.prepare('INSERT INTO content VALUES(?,?,?,1)').run(id,'ministry',JSON.stringify({title,description,image:'/images/'+image,detail:'',date:'',url:''}));
    for(let i=1;i<=12;i++)db.prepare('INSERT INTO content VALUES(?,?,?,1)').run('photo-'+i,'gallery',JSON.stringify({title:'Life at VWO Karati',description:'',image:`/images/${i}.jpg`,detail:'',date:'',url:''}));
  }
  db.exec('CREATE TABLE IF NOT EXISTS migrations (id TEXT PRIMARY KEY)');
  if(!db.prepare('SELECT id FROM migrations WHERE id=?').get('mission-leadership-20260911')){
    db.exec('BEGIN');try{
      const current=JSON.parse(db.prepare('SELECT data FROM settings WHERE id=1').get().data);
      current.mission='Worship, winning souls, and community';
      db.prepare('UPDATE settings SET data=? WHERE id=1').run(JSON.stringify(current));
      db.prepare('INSERT OR IGNORE INTO content VALUES(?,?,?,1)').run('pastor-kamau','leader',JSON.stringify({title:'Reverend Kamau',position:'Reverend',description:'',detail:'',image:'',date:'',url:''}));
      db.prepare('INSERT INTO migrations VALUES(?)').run('mission-leadership-20260911');db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');throw error;}
  }
  return db;
}
