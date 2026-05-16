const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
});

/* ── USERS ── */
app.post('/api/login', async (req, res) => {
  const { phone, password } = req.body;
  if (!phone || !password) return res.json({ success: false, error: 'Missing fields' });
  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE phone = $1 AND password = $2',
      [phone, password]
    );
    if (result.rows.length === 0) return res.json({ success: false, error: 'Wrong phone number or password' });
    const u = result.rows[0];
    res.json({ success: true, user: {
      docId: String(u.id),
      name: u.name,
      phone: u.phone,
      password: u.password,
      premiumStatus: u.premium_status,
      paymentApproved: u.payment_approved,
      createdAt: u.created_at
    }});
  } catch (e) {
    res.json({ success: false, error: 'Connection error. Please try again.' });
  }
});

app.post('/api/register', async (req, res) => {
  const { name, phone, password } = req.body;
  if (!name || !phone || !password) return res.json({ success: false, error: 'Missing fields' });
  try {
    const existing = await pool.query('SELECT id FROM users WHERE phone = $1', [phone]);
    if (existing.rows.length > 0) return res.json({ success: false, error: 'Phone number already registered' });
    await pool.query(
      'INSERT INTO users (name, phone, password, premium_status, payment_approved) VALUES ($1, $2, $3, FALSE, FALSE)',
      [name, phone, password]
    );
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, error: 'Connection error. Please try again.' });
  }
});

app.post('/api/user/update', async (req, res) => {
  const { docId, updates } = req.body;
  if (!docId || !updates) return res.json({ success: false, error: 'Missing fields' });
  try {
    const fields = [];
    const values = [];
    let idx = 1;
    if (updates.name !== undefined) { fields.push(`name = $${idx++}`); values.push(updates.name); }
    if (updates.phone !== undefined) { fields.push(`phone = $${idx++}`); values.push(updates.phone); }
    if (updates.password !== undefined) { fields.push(`password = $${idx++}`); values.push(updates.password); }
    if (fields.length === 0) return res.json({ success: false, error: 'Nothing to update' });
    values.push(parseInt(docId));
    await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id = $${idx}`, values);
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

app.get('/api/user/status', async (req, res) => {
  const { phone } = req.query;
  if (!phone) return res.json({ success: false, paymentApproved: false });
  try {
    const result = await pool.query('SELECT payment_approved FROM users WHERE phone = $1', [phone]);
    if (result.rows.length === 0) return res.json({ success: false, paymentApproved: false });
    res.json({ success: true, paymentApproved: result.rows[0].payment_approved || false });
  } catch (e) {
    res.json({ success: false, paymentApproved: false });
  }
});

app.post('/api/payment/request', async (req, res) => {
  const { phone, userId } = req.body;
  if (!phone) return res.json({ success: false, error: 'Missing fields' });
  try {
    await pool.query(
      'INSERT INTO payment_requests (user_phone, user_id, status) VALUES ($1, $2, $3)',
      [phone, userId ? parseInt(userId) : null, 'pending']
    );
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

/* ── EXAMS ── */
app.get('/api/exams', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM admin_exams ORDER BY created_at DESC');
    const exams = result.rows.map(r => rowToExam(r));
    res.json({ success: true, exams });
  } catch (e) {
    res.json({ success: false, exams: [], error: e.message });
  }
});

app.get('/api/exams/query', async (req, res) => {
  const { course, chapter, difficulty } = req.query;
  try {
    let q = 'SELECT * FROM admin_exams WHERE 1=1';
    const vals = [];
    let idx = 1;
    if (course) { q += ` AND course = $${idx++}`; vals.push(course); }
    if (chapter) { q += ` AND chapter = $${idx++}`; vals.push(parseInt(chapter)); }
    if (difficulty) { q += ` AND difficulty = $${idx++}`; vals.push(difficulty); }
    const result = await pool.query(q, vals);
    const exams = result.rows.map(r => rowToExam(r));
    res.json({ success: true, exams });
  } catch (e) {
    res.json({ success: false, exams: [], error: e.message });
  }
});

app.post('/api/exams', async (req, res) => {
  const { data } = req.body;
  if (!data) return res.json({ success: false, error: 'Missing data' });
  try {
    const result = await pool.query(
      `INSERT INTO admin_exams (course, chapter, difficulty, type, question, options, answer, pairs, alternate_answers, explanation, explanation_mode, choice_explanations, text_size, imgs)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
      [data.course, data.chapter, data.difficulty, data.type || 'multiple_choice',
       data.question, JSON.stringify(data.options || []), data.answer,
       JSON.stringify(data.pairs || []), JSON.stringify(data.alternateAnswers || []),
       data.explanation || '', data.explanationMode || 'single',
       JSON.stringify(data.choiceExplanations || {}), data.textSize || 16,
       JSON.stringify(data.imgs || {})]
    );
    res.json({ success: true, id: String(result.rows[0].id) });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

app.put('/api/exams/:id', async (req, res) => {
  const { data } = req.body;
  try {
    await pool.query(
      `UPDATE admin_exams SET course=$1,chapter=$2,difficulty=$3,type=$4,question=$5,options=$6,answer=$7,pairs=$8,alternate_answers=$9,explanation=$10,explanation_mode=$11,choice_explanations=$12,text_size=$13,imgs=$14,updated_at=NOW() WHERE id=$15`,
      [data.course, data.chapter, data.difficulty, data.type || 'multiple_choice',
       data.question, JSON.stringify(data.options || []), data.answer,
       JSON.stringify(data.pairs || []), JSON.stringify(data.alternateAnswers || []),
       data.explanation || '', data.explanationMode || 'single',
       JSON.stringify(data.choiceExplanations || {}), data.textSize || 16,
       JSON.stringify(data.imgs || {}), parseInt(req.params.id)]
    );
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

app.delete('/api/exams/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM admin_exams WHERE id = $1', [parseInt(req.params.id)]);
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

/* ── MATERIALS ── */
app.get('/api/materials', async (req, res) => {
  const { course, chapter, materialNum } = req.query;
  try {
    let q = 'SELECT * FROM admin_materials WHERE 1=1';
    const vals = [];
    let idx = 1;
    if (course) { q += ` AND course = $${idx++}`; vals.push(course); }
    if (chapter) { q += ` AND chapter = $${idx++}`; vals.push(parseInt(chapter)); }
    if (materialNum) { q += ` AND material_num = $${idx++}`; vals.push(parseInt(materialNum)); }
    const result = await pool.query(q, vals);
    if (result.rows.length === 0) return res.json({ success: true, material: null });
    const r = result.rows[0];
    res.json({ success: true, material: { id: String(r.id), course: r.course, chapter: r.chapter, materialNum: r.material_num, title: r.title, content: r.content } });
  } catch (e) {
    res.json({ success: false, material: null, error: e.message });
  }
});

app.post('/api/materials', async (req, res) => {
  const { course, chapter, materialNum, title, content } = req.body;
  try {
    await pool.query(
      `INSERT INTO admin_materials (course, chapter, material_num, title, content)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (course, chapter, material_num)
       DO UPDATE SET title=$4, content=$5, updated_at=NOW()`,
      [course, parseInt(chapter), parseInt(materialNum), title, content]
    );
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

app.delete('/api/materials', async (req, res) => {
  const { course, chapter, materialNum } = req.query;
  try {
    const result = await pool.query(
      'DELETE FROM admin_materials WHERE course=$1 AND chapter=$2 AND material_num=$3',
      [course, parseInt(chapter), parseInt(materialNum)]
    );
    if (result.rowCount === 0) return res.json({ success: false, error: 'No material found' });
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

/* ── ADMIN USERS ── */
app.get('/api/admin/users', async (req, res) => {
  try {
    const [usersResult, reqResult] = await Promise.all([
      pool.query('SELECT * FROM users ORDER BY created_at DESC'),
      pool.query("SELECT user_phone, id FROM payment_requests WHERE status = 'pending'")
    ]);
    const users = usersResult.rows.map(u => ({
      id: String(u.id),
      name: u.name,
      phone: u.phone,
      password: u.password,
      premiumStatus: u.premium_status,
      paymentApproved: u.payment_approved,
      createdAt: u.created_at
    }));
    const pendingPhones = {};
    reqResult.rows.forEach(r => { pendingPhones[r.user_phone] = String(r.id); });
    res.json({ success: true, users, pendingPhones });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

app.post('/api/admin/users/approve', async (req, res) => {
  const { userId, userPhone } = req.body;
  try {
    await pool.query('UPDATE users SET payment_approved=TRUE, premium_status=TRUE WHERE id=$1', [parseInt(userId)]);
    await pool.query(
      "UPDATE payment_requests SET status='approved', approved_at=NOW() WHERE user_phone=$1 AND status='pending'",
      [userPhone]
    );
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

app.post('/api/admin/users/revoke', async (req, res) => {
  const { userId } = req.body;
  try {
    await pool.query('UPDATE users SET payment_approved=FALSE, premium_status=FALSE WHERE id=$1', [parseInt(userId)]);
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

/* ── HELPERS ── */
function rowToExam(r) {
  return {
    id: String(r.id),
    course: r.course,
    chapter: r.chapter,
    difficulty: r.difficulty,
    type: r.type,
    question: r.question,
    options: r.options || [],
    answer: r.answer,
    pairs: r.pairs || [],
    alternateAnswers: r.alternate_answers || [],
    explanation: r.explanation,
    explanationMode: r.explanation_mode,
    choiceExplanations: r.choice_explanations || {},
    textSize: r.text_size,
    imgs: r.imgs || {},
    createdAt: r.created_at,
    updatedAt: r.updated_at
  };
}

/* ── STATIC FILES ── */
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/exam', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'exam.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
