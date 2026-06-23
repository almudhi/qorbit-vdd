/* QORBIT Tech Solutions — Visual Distortion Detection v2.0 */

const API = '';

// ── Session counters ──────────────────────────────────────
let sessImages = 0, sessDets = 0, sessHigh = 0;

function updateSession(count, maxSv) {
  sessImages++;
  sessDets += count;
  if (['high','critical'].includes(maxSv)) sessHigh++;
  document.getElementById('sessImages').textContent = sessImages;
  document.getElementById('sessDets').textContent   = sessDets;
  if (sessHigh > 0) {
    document.getElementById('sessHighRisk').style.display = '';
    document.getElementById('sessHigh').textContent = sessHigh;
  }
}

// ── خلفية الفضاء ──────────────────────────────────────────
function initSpaceBg() {
  const el = document.getElementById('sbStars');
  if (!el) return;
  for (let i = 0; i < 140; i++) {
    const s = document.createElement('div');
    s.className = 'sb-star';
    const sz = (Math.random() * 2.2 + 0.4).toFixed(1);
    s.style.cssText =
      `left:${(Math.random()*100).toFixed(1)}%;` +
      `top:${(Math.random()*100).toFixed(1)}%;` +
      `width:${sz}px;height:${sz}px;` +
      `--dur:${(1.8+Math.random()*5).toFixed(1)}s;` +
      `--delay:${(Math.random()*9).toFixed(1)}s;` +
      `--min:${(0.04+Math.random()*0.15).toFixed(2)};` +
      `--max:${(0.5+Math.random()*0.5).toFixed(2)};`;
    el.appendChild(s);
  }
}
initSpaceBg();

// ── الثقب الأسود الواقعي ──────────────────────────────────
function initBlackHole() {
  const bg = document.getElementById('spaceBg');
  if (!bg) return;

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';
  bg.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  let W = 0, H = 0;
  function resize() { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; }
  resize();
  window.addEventListener('resize', resize);

  const BH_XF = 0.80, BH_YF = 0.72, TILT = 0.30;
  let t = 0;

  // جسيمات مدارية
  const PARTS = Array.from({length: 110}, () => spawnPart({}));
  function spawnPart(p) {
    const a = Math.random() * Math.PI * 2;
    const r = 140 + Math.random() * 270;
    p.a = a; p.r = r;
    p.da = (0.009 + Math.random() * 0.013) * (Math.random() < 0.5 ? 1 : -1);
    p.dr = -(0.12 + Math.random() * 0.25);
    p.life = 0; p.maxLife = 170 + Math.random() * 220;
    p.sz = 0.5 + Math.random() * 1.1;
    p.warm = Math.random() < 0.65;
    return p;
  }

  // لون القرص حسب درجة الحرارة (t=0 داخلي ساخن، t=1 خارجي بارد)
  function diskColor(tr) {
    if (tr < 0.22) {
      const m = tr / 0.22;
      return [255, Math.round(245 - m * 30), 255];
    } else if (tr < 0.50) {
      const m = (tr - 0.22) / 0.28;
      return [255, Math.round(215 - m * 110), Math.round(225 - m * 210)];
    } else if (tr < 0.75) {
      const m = (tr - 0.50) / 0.25;
      return [255, Math.round(105 - m * 55), 15];
    } else {
      const m = (tr - 0.75) / 0.25;
      return [Math.round(255 - m * 95), Math.round(50 - m * 35), 15];
    }
  }

  function drawDiskHalf(isfront) {
    const cx = W * BH_XF, cy = H * BH_YF;
    const R = Math.min(W, H) * 0.068;
    const inner = R * 1.42, outer = R * 4.7;
    const RINGS = 52;

    ctx.save();
    ctx.translate(cx, cy);

    // قص النصف المطلوب قبل التحجيم
    ctx.beginPath();
    if (isfront) ctx.rect(-outer * 1.6, 0,         outer * 3.2, outer * 1.6);
    else          ctx.rect(-outer * 1.6, -outer * 1.6, outer * 3.2, outer * 1.6);
    ctx.clip();

    // تحجيم y لتشكيل الإهليج
    ctx.scale(1, TILT);

    // رسم الحلقات المتحدة المركز
    for (let i = 0; i <= RINGS; i++) {
      const tr = i / RINGS;
      const r  = inner + tr * (outer - inner);
      const [rv, gv, bv] = diskColor(tr);
      const alpha = (1 - tr * 0.74) * (isfront ? 0.20 : 0.10);
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${rv},${gv},${bv},${alpha})`;
      ctx.lineWidth   = (outer - inner) / RINGS * 1.12;
      ctx.stroke();
    }

    // إضاءة دوبلر — نقطة ساطعة تدور مع القرص
    const dA  = -t;
    const dGx = Math.cos(dA) * (inner + outer) * 0.42;
    const dGy = Math.sin(dA) * (inner + outer) * 0.42;
    const dg  = ctx.createRadialGradient(dGx, dGy, 0, dGx, dGy, outer * 0.62);
    dg.addColorStop(0,   `rgba(255,210,80,${isfront ? 0.22 : 0.10})`);
    dg.addColorStop(0.45,`rgba(255,130,20,${isfront ? 0.09 : 0.04})`);
    dg.addColorStop(1,   'transparent');
    ctx.beginPath();
    ctx.arc(0, 0, outer, 0, Math.PI * 2, false);
    ctx.arc(0, 0, inner, 0, Math.PI * 2, true);
    ctx.fillStyle = dg;
    ctx.fill('evenodd');

    ctx.restore();
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const cx = W * BH_XF, cy = H * BH_YF;
    const R  = Math.min(W, H) * 0.068;

    // ─ 1. توهج الجاذبية الخارجي (طبقات)
    for (let i = 3; i >= 1; i--) {
      const g = ctx.createRadialGradient(cx, cy, R, cx, cy, R * i * 2.8);
      g.addColorStop(0,   `rgba(55,15,120,${0.14 / i})`);
      g.addColorStop(0.5, `rgba(20,8,80,${0.07 / i})`);
      g.addColorStop(1,   'transparent');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, R * i * 2.8, 0, Math.PI * 2); ctx.fill();
    }

    // ─ 2. قرص التراكم — النصف الخلفي
    drawDiskHalf(false);

    // ─ 3. حلقة الفوتونات (نابضة)
    const pulse = 0.18 + Math.sin(t * 2.1) * 0.07;
    const ph = ctx.createRadialGradient(cx, cy, R * 0.88, cx, cy, R * 1.38);
    ph.addColorStop(0,    'transparent');
    ph.addColorStop(0.52, `rgba(185,225,255,${pulse})`);
    ph.addColorStop(0.72, `rgba(100,175,255,${pulse * 0.45})`);
    ph.addColorStop(1,    'transparent');
    ctx.fillStyle = ph;
    ctx.beginPath(); ctx.arc(cx, cy, R * 1.38, 0, Math.PI * 2); ctx.fill();

    // ─ 4. أفق الحدث (أسود مطلق)
    const eh = ctx.createRadialGradient(cx - R * 0.2, cy - R * 0.14, 0, cx, cy, R * 1.10);
    eh.addColorStop(0,    '#000'); eh.addColorStop(0.80, '#000');
    eh.addColorStop(0.92, 'rgba(0,0,0,.88)'); eh.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = eh;
    ctx.beginPath(); ctx.arc(cx, cy, R * 1.10, 0, Math.PI * 2); ctx.fill();

    // ─ 5. قرص التراكم — النصف الأمامي (فوق أفق الحدث)
    drawDiskHalf(true);

    // ─ 6. نفاثتان نسبيتان (Relativistic Jets)
    for (const jDir of [-1, 1]) {
      const jLen  = R * 5.8;
      const jW    = R * 0.14;
      const jpul  = 0.20 + Math.sin(t * 1.85 + jDir * 1.2) * 0.07;
      const jg    = ctx.createLinearGradient(cx, cy, cx, cy + jDir * jLen);
      jg.addColorStop(0,   `rgba(175,225,255,${jpul})`);
      jg.addColorStop(0.38,`rgba(80,145,255,${jpul * 0.42})`);
      jg.addColorStop(0.72,`rgba(30,75,200,${jpul * 0.14})`);
      jg.addColorStop(1,   'transparent');
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(cx - jW, cy - jDir * R * 0.88);
      ctx.bezierCurveTo(cx - jW * 0.35, cy + jDir * jLen * 0.33,
                        cx - jW * 0.08,  cy + jDir * jLen * 0.70, cx, cy + jDir * jLen);
      ctx.bezierCurveTo(cx + jW * 0.08,  cy + jDir * jLen * 0.70,
                        cx + jW * 0.35,  cy + jDir * jLen * 0.33, cx + jW, cy - jDir * R * 0.88);
      ctx.closePath();
      ctx.fillStyle = jg; ctx.fill();
      ctx.restore();
    }

    // ─ 7. جسيمات مدارية
    PARTS.forEach(p => {
      p.life++; p.a += p.da; p.r += p.dr * 0.07;
      if (p.life >= p.maxLife || p.r < 28) { spawnPart(p); return; }
      const frac  = p.life / p.maxLife;
      const px    = cx + Math.cos(p.a) * p.r;
      const py    = cy + Math.sin(p.a) * p.r * TILT;
      const alpha = Math.sin(frac * Math.PI) * 0.48;
      ctx.beginPath(); ctx.arc(px, py, p.sz * (1 - frac * 0.5), 0, Math.PI * 2);
      ctx.fillStyle = p.warm
        ? `rgba(255,${Math.round(115 + frac * 55)},25,${alpha})`
        : `rgba(75,${Math.round(148 + frac * 52)},255,${alpha})`;
      ctx.fill();
    });

    t += 0.006;
    requestAnimationFrame(draw);
  }
  draw();
}
initBlackHole();

// ── Welcome → App flow ────────────────────────────────────
const ws      = document.getElementById('welcomeScreen');
const mainApp = document.getElementById('mainApp');
const wsBtn   = document.getElementById('wsEnterBtn');

function enterApp() {
  ws.classList.add('exit');
  setTimeout(() => {
    ws.style.display = 'none';
    mainApp.classList.remove('hidden');
  }, 480);
}

wsBtn.addEventListener('click', enterApp);
ws.addEventListener('keydown', e => { if (e.key === 'Enter') enterApp(); });

// ── 3D tilt على بطاقات الفريق ─────────────────────────────
document.querySelectorAll('.ts-card').forEach(card => {
  card.addEventListener('mousemove', e => {
    const r = card.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width  - 0.5;
    const y = (e.clientY - r.top)  / r.height - 0.5;
    card.style.transform =
      `translateY(-10px) perspective(650px) rotateX(${-y*11}deg) rotateY(${x*11}deg) scale(1.03)`;
  });
  card.addEventListener('mouseleave', () => { card.style.transform = ''; });
});

// ── DOM refs ──────────────────────────────────────────────
const uploadZone    = document.getElementById('uploadZone');
const browseLink    = document.getElementById('browseLink');
const fileInput     = document.getElementById('fileInput');
const imgWrap       = document.getElementById('imgWrap');
const previewImg    = document.getElementById('previewImg');
const imgMeta       = document.getElementById('imgMeta');
const imgScanOvl    = document.getElementById('imgScanOverlay');
const resetBtn      = document.getElementById('resetBtn');
const placeholder   = document.getElementById('placeholder');
const loader        = document.getElementById('loader');
const results       = document.getElementById('results');
const chipYolo      = document.getElementById('chipYolo');
const chipClaude    = document.getElementById('chipClaude');
const settingsBtn   = document.getElementById('settingsBtn');
const settingsDrawer= document.getElementById('settingsDrawer');
const apiKeyInput   = document.getElementById('apiKeyInput');
const saveKeyBtn    = document.getElementById('saveKeyBtn');
const backToWelcome = document.getElementById('backToWelcome');

// ── Class colours ─────────────────────────────────────────
const CLASS_HEX = {
  BAD_BILLBOARD:     '#FF8C00',
  BAD_STREETLIGHT:   '#FFD200',
  BROKEN_SIGNAGE:    '#FF2222',
  CLUTTER_SIDEWALK:  '#00C8B0',
  CONSTRUCTION_ROAD: '#CC1010',
  FADED_SIGNAGE:     '#909090',
  GARBAGE:           '#22AA44',
  GRAFFITI:          '#CC00CC',
  POTHOLES:          '#FF0000',
  SAND_ON_ROAD:      '#D4A800',
  UNKEPT_FACADE:     '#B05020',
};

// ── Arabic names ──────────────────────────────────────────
const CLASS_AR = {
  BAD_BILLBOARD:     'لافتة إعلانية تالفة',
  BAD_STREETLIGHT:   'إنارة طريق معطلة',
  BROKEN_SIGNAGE:    'لافتة توجيهية مكسورة',
  CLUTTER_SIDEWALK:  'رصيف مزدحم بعوائق',
  CONSTRUCTION_ROAD: 'حفريات وأعمال طريق',
  FADED_SIGNAGE:     'لافتة باهتة غير مقروءة',
  GARBAGE:           'نفايات متراكمة',
  GRAFFITI:          'كتابة عشوائية على الجدران',
  POTHOLES:          'حفر خطيرة في الطريق',
  SAND_ON_ROAD:      'رمال على سطح الطريق',
  UNKEPT_FACADE:     'واجهة مبنى متهالكة',
};

// ── Arabic descriptions ───────────────────────────────────
const CLASS_DESC = {
  BAD_BILLBOARD:     'لافتة إعلانية متضررة أو مكسورة تؤثر على المشهد البصري وتحتاج صيانة',
  BAD_STREETLIGHT:   'عمود إنارة عاطل أو متضرر يُضعف الرؤية الليلية ويُشكّل خطراً على الطريق',
  BROKEN_SIGNAGE:    'لافتة توجيهية أو إرشادية مكسورة أو منهارة تعيق توجيه المستخدمين',
  CLUTTER_SIDEWALK:  'رصيف مكتظ بأغراض أو عوائق تحدّ من حركة المشاة وإمكانية الوصول',
  CONSTRUCTION_ROAD: 'منطقة إنشاء أو صيانة طريق نشطة قد تستلزم تحويل المرور',
  FADED_SIGNAGE:     'لافتة باهتة الألوان وغير واضحة المعالم تحتاج إلى تجديد أو استبدال',
  GARBAGE:           'تراكم نفايات في غير أماكنها المخصصة يؤثر على نظافة البيئة المحيطة',
  GRAFFITI:          'كتابة أو رسوم عشوائية على الجدران والأسطح العامة دون إذن',
  POTHOLES:          'حفر خطيرة في سطح الطريق قد تُسبّب أضراراً للمركبات وخطراً على السلامة',
  SAND_ON_ROAD:      'تراكم كميات من الرمال على سطح الطريق يُهدد السلامة المرورية',
  UNKEPT_FACADE:     'واجهة مبنى في حالة سيئة وتحتاج ترميماً وصيانة دورية',
};

// ── Class icons ───────────────────────────────────────────
const CLASS_ICON = {
  BAD_BILLBOARD:     '📋',
  BAD_STREETLIGHT:   '💡',
  BROKEN_SIGNAGE:    '⚠️',
  CLUTTER_SIDEWALK:  '📦',
  CONSTRUCTION_ROAD: '🚧',
  FADED_SIGNAGE:     '🔅',
  GARBAGE:           '🗑️',
  GRAFFITI:          '🎨',
  POTHOLES:          '⚫',
  SAND_ON_ROAD:      '🌬️',
  UNKEPT_FACADE:     '🏚️',
};

// ── API Key ───────────────────────────────────────────────
apiKeyInput.value = localStorage.getItem('vdd_api_key') || '';

settingsBtn.addEventListener('click', () => settingsDrawer.classList.toggle('hidden'));
saveKeyBtn.addEventListener('click', () => {
  localStorage.setItem('vdd_api_key', apiKeyInput.value.trim());
  settingsDrawer.classList.add('hidden');
  checkHealth();
});

backToWelcome.addEventListener('click', () => {
  ws.classList.remove('exit');
  ws.style.display = '';
  mainApp.classList.add('hidden');
});

// ── Health check ──────────────────────────────────────────
async function checkHealth() {
  try {
    const d = await fetch(`${API}/api/health`).then(r => r.json());
    const hasKey = Boolean(localStorage.getItem('vdd_api_key')) || d.claude;
    setChip(chipYolo,   d.yolo,   'YOLO');
    setChip(chipClaude, hasKey,   'AI Vision');
    if (!d.yolo && d.yolo_error) chipYolo.title = d.yolo_error;
  } catch {
    setChip(chipYolo,   false, 'YOLO');
    setChip(chipClaude, false, 'AI Vision');
  }
}
function setChip(el, active, label) {
  el.className = 'chip ' + (active ? 'active' : 'inactive');
  el.innerHTML = `<span class="dot"></span> ${label}`;
}

// ── Upload handlers ───────────────────────────────────────
uploadZone.addEventListener('click', () => fileInput.click());
browseLink.addEventListener('click', e => { e.stopPropagation(); fileInput.click(); });

uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
uploadZone.addEventListener('dragleave', ()  => uploadZone.classList.remove('drag-over'));
uploadZone.addEventListener('drop', e => {
  e.preventDefault(); uploadZone.classList.remove('drag-over');
  const f = e.dataTransfer.files[0];
  if (f && f.type.startsWith('image/')) handleFile(f);
});
fileInput.addEventListener('change', () => { if (fileInput.files[0]) handleFile(fileInput.files[0]); });

resetBtn.addEventListener('click', () => {
  imgWrap.classList.add('hidden');
  imgMeta.classList.add('hidden');
  imgScanOvl.classList.add('hidden');
  uploadZone.classList.remove('hidden');
  results.classList.add('hidden');
  loader.classList.add('hidden');
  placeholder.classList.remove('hidden');
  fileInput.value = '';
  previewImg.src  = '';
});

// ── Main flow ─────────────────────────────────────────────
function handleFile(file) {
  previewImg.src = URL.createObjectURL(file);
  uploadZone.classList.add('hidden');
  imgWrap.classList.remove('hidden');
  imgScanOvl.classList.remove('hidden');
  imgMeta.classList.remove('hidden');
  imgMeta.textContent = `${file.name} · ${(file.size/1024).toFixed(0)} KB`;

  placeholder.classList.add('hidden');
  results.classList.add('hidden');
  loader.classList.remove('hidden');

  const fd = new FormData();
  fd.append('file', file);
  const key = localStorage.getItem('vdd_api_key');
  const headers = key ? { 'X-Api-Key': key } : {};

  fetch(`${API}/api/detect`, { method:'POST', body:fd, headers })
    .then(r => { if (!r.ok) return r.json().then(e=>{throw new Error(e.detail||r.statusText)}); return r.json(); })
    .then(data => {
      loader.classList.add('hidden');
      imgScanOvl.classList.add('hidden');
      if (data.annotated_image) {
        previewImg.src = `data:image/jpeg;base64,${data.annotated_image}`;
        imgMeta.textContent =
          `${file.name} · ${data.image_size.width}×${data.image_size.height}px`
          + (data.count ? ` · ${data.count} اكتشاف` : '');
      }
      updateSession(data.count, data.max_severity);
      renderResults(data);
    })
    .catch(err => {
      loader.classList.add('hidden');
      imgScanOvl.classList.add('hidden');
      results.innerHTML = `<div class="err-box">⚠ ${esc(err.message)}</div>`;
      results.classList.remove('hidden');
    });
}

// ── Render results ────────────────────────────────────────
const svAr = { none:'—', low:'منخفض', medium:'متوسط', high:'عالٍ', critical:'حرج' };
function svClass(sv){ return {low:'low',medium:'medium',high:'high',critical:'critical'}[sv]||''; }

function renderResults(d) {
  let html = '';

  // ─ شريط الملخص
  html += `
  <div class="sum-bar">
    <div class="sum-cell">
      <div class="sum-val">${d.count}</div>
      <div class="sum-lbl">اكتشافات</div>
    </div>
    <div class="sum-cell">
      <div class="sum-val ${svClass(d.max_severity)}">${svAr[d.max_severity]||'—'}</div>
      <div class="sum-lbl">أعلى خطورة</div>
    </div>
    <div class="sum-cell">
      <div class="sum-val">${d.dp_score.toFixed(1)}</div>
      <div class="sum-lbl">درجة المخاطر</div>
    </div>
  </div>`;

  // ─ قياس الخطر الدائري
  const maxScore = 15;
  const pct   = Math.min(d.dp_score / maxScore, 1);
  const dash  = Math.round(pct * 220);
  const riskColor =
    d.dp_score === 0   ? 'rgba(0,212,255,.4)' :
    d.max_severity === 'critical' ? 'var(--sv-critical)' :
    d.max_severity === 'high'     ? 'var(--sv-high)' :
    d.max_severity === 'medium'   ? 'var(--sv-medium)' : 'var(--sv-low)';

  const riskLabel =
    d.count === 0     ? 'لا تشوهات مكتشفة' :
    d.dp_score > 10   ? 'خطر مرتفع جداً — يتطلب تدخلاً فورياً' :
    d.dp_score > 5    ? 'خطر متوسط — يحتاج متابعة' :
    d.dp_score > 0    ? 'خطر منخفض — مراقبة دورية' : 'المنطقة آمنة';

  html += `
  <div class="risk-gauge-row">
    <svg class="risk-gauge-svg" viewBox="0 0 90 90">
      <circle class="risk-bg"   cx="45" cy="45" r="35"/>
      <circle class="risk-fill" cx="45" cy="45" r="35"
              style="stroke:${riskColor};stroke-dashoffset:${220-dash}"/>
      <text x="45" y="45" text-anchor="middle" dominant-baseline="central"
            style="fill:${riskColor};font-size:13px;font-weight:800;
                   font-family:Consolas,monospace;transform:rotate(90deg);transform-origin:45px 45px;">
        ${Math.round(pct*100)}%
      </text>
    </svg>
    <div class="risk-gauge-info">
      <div class="risk-gauge-title">مؤشر الخطر</div>
      <div class="risk-gauge-val" style="color:${riskColor}">${d.dp_score.toFixed(2)}</div>
      <div class="risk-gauge-desc">${riskLabel}</div>
    </div>
  </div>`;

  // ─ بطاقات التشوهات المكتشفة
  html += `<div class="sect"><div class="sect-title">التشوهات المكتشفة</div>`;
  if (d.count === 0) {
    html += `<div class="no-det">✓ لم يُكتشف أي تشوه في هذه الصورة</div>`;
  } else {
    html += `<div class="det-list">`;
    for (const det of d.detections) {
      const hex    = CLASS_HEX[det.class_name] || '#888';
      const pct2   = (det.confidence * 100).toFixed(1);
      const arName = CLASS_AR[det.class_name]   || det.class_name.replace(/_/g,' ');
      const desc   = CLASS_DESC[det.class_name] || '';
      const icon   = CLASS_ICON[det.class_name] || '◉';
      const sv     = det.severity;
      html += `
      <div class="det-card" style="--accent:${hex}">
        <div class="det-card-icon">${icon}</div>
        <div class="det-card-body">
          <div class="det-card-header">
            <div class="det-card-names">
              <div class="det-card-ar">${arName}</div>
              <div class="det-card-en">${det.class_name.replace(/_/g,' ')}</div>
            </div>
            <div class="det-card-meta">
              <span class="badge ${svClass(sv)}">${svAr[sv]||sv}</span>
              <div class="det-card-conf">${pct2}%</div>
            </div>
          </div>
          <div class="det-conf-bar-wrap">
            <div class="det-conf-bar" data-w="${pct2}"
                 style="width:0%;background:linear-gradient(90deg,${hex}66,${hex})"></div>
          </div>
          <div class="det-card-desc">${desc}</div>
        </div>
      </div>`;
    }
    html += `</div>`;
  }
  html += `</div>`;

  // ─ مخطط توزيع الفئات
  if (d.count > 0 && Object.keys(d.class_counts).length > 0) {
    const maxCnt = Math.max(...Object.values(d.class_counts));
    html += `<div class="sect"><div class="sect-title">توزيع الفئات</div><div class="class-chart">`;
    for (const [cls, cnt] of Object.entries(d.class_counts)) {
      const hex  = CLASS_HEX[cls] || '#888';
      const wpct = Math.round((cnt / maxCnt) * 100);
      html += `
      <div class="class-bar-row">
        <div class="class-bar-dot" style="background:${hex}"></div>
        <div class="class-bar-name">${cls.replace(/_/g,' ')}</div>
        <div class="class-bar-track">
          <div class="class-bar-fill" data-w="${wpct}" style="width:0%;background:${hex}88"></div>
        </div>
        <div class="class-bar-count">${cnt}</div>
      </div>`;
    }
    html += `</div></div>`;
  }

  // ─ شبكة DP المرئية
  html += `<div class="sect"><div class="sect-title">خريطة حرارة DP</div>
  <div class="dp-section">
    <div class="dp-grid-visual" id="dpGrid"></div>
    <div class="dp-legend">
      <div class="dp-score-display">${d.dp_score.toFixed(2)}</div>
      <div class="dp-score-label">درجة المسار الأمثل</div>
      <div class="dp-desc">
        تُظهر الخريطة تركّز التشوهات في الصورة عبر شبكة
        <strong>${GRID_SIZE}×${GRID_SIZE}</strong>.<br>
        الخلايا المحاطة بـ <span style="color:var(--quantum-cyan)">سيان</span>
        هي مسار الفحص الأمثل.
      </div>
    </div>
  </div></div>`;

  // ─ تحليل الذكاء الاصطناعي
  if (d.claude_analysis) {
    html += `<div class="sect"><div class="sect-title">تحليل الذكاء الاصطناعي</div>
    <div class="ai-text">${esc(d.claude_analysis)}</div></div>`;
  }

  results.innerHTML = html;
  results.classList.remove('hidden');

  // ── تحريك أشرطة الثقة (بعد الإدراج في DOM)
  requestAnimationFrame(() => {
    document.querySelectorAll('.det-conf-bar[data-w]').forEach(el => {
      el.style.width = el.dataset.w + '%';
    });
    document.querySelectorAll('.class-bar-fill[data-w]').forEach(el => {
      el.style.width = el.dataset.w + '%';
    });

    // ── رسم شبكة DP
    const grid    = d.dp_grid;
    const path    = new Set(d.dp_path.map(([r,c]) => `${r},${c}`));
    const dpEl    = document.getElementById('dpGrid');
    if (!dpEl || !grid) return;

    const flat    = grid.flat();
    const maxVal  = Math.max(...flat, .001);
    dpEl.innerHTML = '';
    for (let r = 0; r < grid.length; r++) {
      for (let c = 0; c < grid[r].length; c++) {
        const v    = grid[r][c];
        const norm = v / maxVal;
        const cell = document.createElement('div');
        cell.className = 'dp-cell' + (path.has(`${r},${c}`) ? ' path-cell' : '');
        cell.style.background = dpCellColor(norm);
        cell.textContent = v > 0 ? v.toFixed(1) : '';
        dpEl.appendChild(cell);
      }
    }
  });
}

function dpCellColor(norm) {
  if (norm === 0)    return 'rgba(4,6,15,.7)';
  if (norm < 0.25)   return `rgba(0,71,255,${.15 + norm * .4})`;
  if (norm < 0.6)    return `rgba(0,212,255,${.25 + norm * .35})`;
  if (norm < 0.85)   return `rgba(240,160,32,${.4 + norm * .3})`;
  return `rgba(238,60,60,${.5 + norm * .35})`;
}

const GRID_SIZE = 5;

function esc(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/\n/g,'<br>');
}

// ── Chatbot ───────────────────────────────────────────────
const CHAT_KB = [
  { t:['مرحبا','هلا','اهلا','السلام','hello','hi','صباح','مساء'],
    r:'أهلاً بك في QORBIT! 👋\nأنا مساعدك الذكي — يمكنني مساعدتك في استخدام نظام كشف التشوهات البصرية.',
    q:['كيف أرفع صورة؟','ما هي التشوهات المكتشفة؟','كيف أفعّل AI Vision؟'] },
  { t:['رفع','صورة','كيف','ارفع','upload','drag','سحب','تصفح'],
    r:'📸 خطوات رفع الصورة:\n① اضغط على منطقة "رفع الصورة"\n② أو اسحب الصورة وأفلتها مباشرة\n③ صيغ مدعومة: JPEG · PNG · WebP\n④ حجم أقصى: 20 MB\n\nالتحليل يبدأ تلقائياً بعد الرفع!',
    q:['ما هي التشوهات المكتشفة؟','ما معنى درجة الخطر؟'] },
  { t:['تشوه','أنواع','فئات','يكتشف','فئة','class','distortion'],
    r:'🔍 النظام يكتشف 11 نوع تشوه:\n\n📋 لافتة إعلانية تالفة\n💡 إنارة طريق معطلة\n⚠️ لافتة مكسورة\n📦 رصيف مزدحم\n🚧 حفريات طريق\n🔅 لافتة باهتة\n🗑️ نفايات\n🎨 جرافيتي\n⚫ حفر في الطريق\n🌬️ رمال على الطريق\n🏚️ واجهة متهالكة',
    q:['كيف أرفع صورة؟','ما معنى درجة الخطر؟'] },
  { t:['yolo','نموذج','كشف','best','model','v11'],
    r:'🤖 YOLOv11 — أحدث نماذج الكشف الفوري:\n\n• كشف دقيق وسريع في الوقت الحقيقي\n• مُدرَّب على 11 فئة تشوه بصري\n• يُنتج صورة مُعلَّمة بمربعات الكشف\n• حد الثقة الأدنى: 15%',
    q:['ما هو Claude AI؟','ما معنى درجة الخطر؟'] },
  { t:['claude','api','مفتاح','ذكاء','vision','تحليل','انثروبيك','anthropic'],
    r:'🧠 تفعيل Claude AI Vision:\n\n① اضغط ⚙️ في أعلى الصفحة\n② أدخل مفتاح Anthropic API\n③ اضغط "حفظ"\n\n✅ يُخزَّن في متصفحك فقط\n\nبدونه: يعمل YOLOv11 وحده\nمعه: تحليل نصي تفصيلي بالعربية',
    q:['كيف أرفع صورة؟','ما معنى درجة الخطر؟'] },
  { t:['خطر','درجة','dp','مخاطر','ديناميكية','score','risk','شبكة'],
    r:'📊 درجة الخطر — خوارزمية DP:\n\n• الصورة تُقسَّم إلى شبكة 5×5\n• تُحسب كثافة التشوهات في كل خلية\n• يُجاد المسار الأمثل للفحص\n\n🟢 0–5: خطر منخفض\n🟡 5–10: خطر متوسط\n🔴 10+: خطر مرتفع — تدخّل فوري',
    q:['ما هي التشوهات المكتشفة؟','كيف أرفع صورة؟'] },
  { t:['ثقة','نسبة','confidence','دقة'],
    r:'📈 نسبة الثقة:\n\n• 85–100%: اكتشاف مؤكد ✅\n• 60–85%: اكتشاف موثوق 🔵\n• 30–60%: اكتشاف محتمل 🟡\n• أقل: يحتاج مراجعة 🔴\n\nالنظام يعرض الاكتشافات من 15% فأعلى',
    q:['ما معنى درجة الخطر؟','ما هي التشوهات المكتشفة؟'] },
  { t:['drone','طائرة','درون','مسيّرة','uav','جوية','مسيرة'],
    r:'🚁 QORBIT مُحسَّن لصور الطائرات المسيّرة:\n\n• يعمل مع الصور الجوية والأرضية\n• كشف تشوهات البنية التحتية الحضرية\n• يدعم الإضاءة المختلفة (نهار/ليل)',
    q:['كيف أرفع صورة؟','ما هي التشوهات المكتشفة؟'] },
  { t:['شكرا','ممتاز','رائع','جميل','مشكور','thanks','thank','عظيم'],
    r:'بكل سرور! 🌟 QORBIT هنا لخدمتك.\nهل تحتاج مساعدة في شيء آخر؟',
    q:['كيف أرفع صورة؟','ما هي التشوهات المكتشفة؟','كيف أفعّل AI Vision؟'] }
];

function initChatbot() {
  const fab   = document.getElementById('chatFab');
  const panel = document.getElementById('chatPanel');
  const close = document.getElementById('chatClose');
  const msgs  = document.getElementById('chatMsgs');
  const quick = document.getElementById('chatQuick');
  const input = document.getElementById('chatInput');
  const send  = document.getElementById('chatSend');
  if (!fab) return;

  let isOpen = false;
  const notif = fab.querySelector('.chat-notif');

  function toggle() {
    isOpen = !isOpen;
    if (isOpen) {
      panel.classList.remove('hidden');
      if (notif) notif.style.display = 'none';
      if (msgs.children.length === 0) {
        botReply('مرحباً! أنا مساعد QORBIT 🤖\nيمكنني مساعدتك في استخدام نظام كشف التشوه البصري. اختر سؤالاً أو اكتب ما يخطر ببالك!',
          ['كيف أرفع صورة؟','ما هي التشوهات المكتشفة؟','كيف أفعّل AI Vision؟']);
      }
    } else {
      panel.classList.add('hidden');
    }
  }

  fab.addEventListener('click', toggle);
  close.addEventListener('click', toggle);

  function nowTime() {
    return new Date().toLocaleTimeString('ar', {hour:'2-digit', minute:'2-digit'});
  }

  function addBubble(text, isBot) {
    const d = document.createElement('div');
    d.className = `chat-msg ${isBot ? 'bot' : 'user'}`;
    d.innerHTML = `<div class="chat-bubble">${esc(text)}</div><div class="chat-time">${nowTime()}</div>`;
    msgs.appendChild(d);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function setQuickReplies(qs) {
    quick.innerHTML = '';
    (qs || []).forEach(q => {
      const b = document.createElement('button');
      b.className = 'chat-quick-btn'; b.textContent = q;
      b.addEventListener('click', () => handleSend(q));
      quick.appendChild(b);
    });
  }

  function botReply(text, qs) {
    setTimeout(() => { addBubble(text, true); setQuickReplies(qs || []); }, 310);
  }

  function handleSend(text) {
    text = text.trim(); if (!text) return;
    addBubble(text, false);
    input.value = ''; setQuickReplies([]);
    const low = text.toLowerCase();
    let best = null, bestScore = 0;
    for (const entry of CHAT_KB) {
      const sc = entry.t.filter(kw => low.includes(kw)).length;
      if (sc > bestScore) { bestScore = sc; best = entry; }
    }
    if (best && bestScore > 0) botReply(best.r, best.q);
    else botReply('لم أفهم سؤالك تماماً 😅\nجرّب أحد الأسئلة الشائعة أدناه:',
      ['كيف أرفع صورة؟','ما هي التشوهات المكتشفة؟','ما معنى درجة الخطر؟','كيف أفعّل AI Vision؟']);
  }

  send.addEventListener('click', () => handleSend(input.value));
  input.addEventListener('keydown', e => { if (e.key === 'Enter') handleSend(input.value); });
}

// ── Init ──────────────────────────────────────────────────
checkHealth();
initChatbot();
