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

// ── الثقب الأسود ─────────────────────────────────────────
function initBlackHole() {
  const bg = document.getElementById('spaceBg');
  if (!bg) return;

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';
  bg.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  // الثقب في الجانب الأيمن السفلي — لا يتداخل مع المحتوى
  const BH_XF = 0.78, BH_YF = 0.68;
  let time = 0;

  // جسيمات تنجذب نحو الثقب
  const PARTICLES = Array.from({length: 90}, () => resetParticle({}));

  function resetParticle(p) {
    const a = Math.random() * Math.PI * 2;
    const d = 200 + Math.random() * 350;
    p.x  = Math.cos(a) * d;
    p.y  = Math.sin(a) * d * 0.35;
    p.vx = (-Math.cos(a) * 0.4) + (Math.sin(a) * 0.6);
    p.vy = (-Math.sin(a) * 0.15) + (Math.cos(a) * 0.2);
    p.life = 0;
    p.maxLife = 120 + Math.random() * 180;
    p.size = 0.8 + Math.random() * 1.4;
    p.color = Math.random() < 0.5
      ? `rgba(255,${Math.round(100+Math.random()*120)},30,`
      : `rgba(80,${Math.round(150+Math.random()*100)},255,`;
    return p;
  }

  function draw() {
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const cx = W * BH_XF, cy = H * BH_YF;
    const R  = Math.min(W, H) * 0.068;  // نصف قطر أفق الحدث
    const TILT = 0.28;                   // ميل قرص التراكم

    // ── 1. توهج الجاذبية الخارجي
    const outerGlow = ctx.createRadialGradient(cx, cy, R, cx, cy, R * 6);
    outerGlow.addColorStop(0,   'rgba(80,30,160,0.28)');
    outerGlow.addColorStop(0.35,'rgba(30,10,100,0.14)');
    outerGlow.addColorStop(0.7, 'rgba(0,40,120,0.07)');
    outerGlow.addColorStop(1,   'transparent');
    ctx.fillStyle = outerGlow;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 6, 0, Math.PI * 2);
    ctx.fill();

    // ── 2. قرص التراكم — النصف الخلفي
    drawDisk(ctx, cx, cy, R, TILT, time, false);

    // ── 3. أفق الحدث (الدائرة السوداء)
    const bhGrad = ctx.createRadialGradient(cx - R*0.22, cy - R*0.18, 0, cx, cy, R * 1.18);
    bhGrad.addColorStop(0,    '#000000');
    bhGrad.addColorStop(0.78, '#000000');
    bhGrad.addColorStop(0.9,  'rgba(0,0,0,.82)');
    bhGrad.addColorStop(1.0,  'rgba(0,0,0,0)');
    ctx.fillStyle = bhGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.12, 0, Math.PI * 2);
    ctx.fill();

    // ── 4. حلقة الفوتونات
    const pulse = 0.28 + Math.sin(time * 1.8) * 0.08;
    ctx.save();
    ctx.shadowColor = 'rgba(130,200,255,.9)';
    ctx.shadowBlur  = 18;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.04, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(150,210,255,${pulse})`;
    ctx.lineWidth   = 2.5;
    ctx.stroke();
    ctx.restore();

    // ── 5. قرص التراكم — النصف الأمامي
    drawDisk(ctx, cx, cy, R, TILT, time, true);

    // ── 6. جسيمات التراكم
    PARTICLES.forEach(p => {
      p.life++;
      if (p.life > p.maxLife) resetParticle(p);
      const t   = p.life / p.maxLife;
      const pull = 1 + t * t * 3;
      p.vx *= 0.992; p.vy *= 0.992;
      p.vx -= (p.x / 600) * pull * 0.12;
      p.vy -= (p.y / 600) * pull * 0.12;
      p.x  += p.vx; p.y  += p.vy;
      const alpha = Math.sin(t * Math.PI) * 0.55;
      ctx.fillStyle = p.color + alpha + ')';
      ctx.beginPath();
      ctx.arc(cx + p.x, cy + p.y * TILT, p.size * (1 - t * 0.5), 0, Math.PI * 2);
      ctx.fill();
    });

    time += 0.007;
    requestAnimationFrame(draw);
  }

  function drawDisk(ctx, cx, cy, R, tilt, time, front) {
    const innerR = R * 1.35, outerR = R * 4.2;
    const steps  = 180;
    ctx.save();
    for (let i = 0; i < steps; i++) {
      const a    = (i / steps) * Math.PI * 2 + time;
      const cosA = Math.cos(a);
      const sinA = Math.sin(a) * tilt;
      if ( front && sinA < 0) continue;
      if (!front && sinA >= 0) continue;

      // تأثير دوبلر: الجانب المقترب أكثر إشراقاً
      const doppler = Math.max(0.35, Math.min(1.05, 0.7 + Math.cos(a) * 0.35));

      for (let r2 = innerR; r2 <= outerR; r2 += 1.8) {
        const t   = (r2 - innerR) / (outerR - innerR);
        const px  = cx + cosA * r2;
        const py  = cy + sinA * r2;
        let rv, gv, bv, al;
        if (t < 0.18) {
          rv = 220; gv = 200; bv = 255;
          al = (0.32 - t * 1.2) * doppler;
        } else if (t < 0.48) {
          const tt = (t - 0.18) / 0.3;
          rv = 255; gv = Math.round(200 - tt * 70); bv = Math.round(240 - tt * 210);
          al = (0.26 - tt * 0.1) * doppler;
        } else {
          const tt = (t - 0.48) / 0.52;
          rv = 255; gv = Math.round(130 - tt * 100); bv = 10;
          al = (0.16 - tt * 0.11) * doppler;
        }
        al = Math.max(0, al);
        ctx.fillStyle = `rgba(${rv},${gv},${bv},${al})`;
        ctx.fillRect(px - 1, py - 1, front ? 2.2 : 1.4, front ? 2.2 : 1.4);
      }
    }
    ctx.restore();
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

// ── Init ──────────────────────────────────────────────────
checkHealth();
