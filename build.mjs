// 화천이티씨 부품 사이트 자동 갱신 스크립트
// 스마트스토어 판매중 상품 목록(챗봇 동기화 주소, 읽기 전용)을 읽어 동적 페이지와 구글 피드를 다시 만든다.
// 정적 가이드 페이지(guide*.html, faq.html, returns.html 등)는 건드리지 않는다.
import fs from 'node:fs/promises';

const SRC = 'https://chatbot-tawny-six-65.vercel.app/api/sync-products';
const BASE = 'https://hwacheonetc.com/';
const STORE = 'https://smartstore.naver.com/hwacheonetc';
const TEL = '화천이티씨 041-552-5147 / 모바일 010-5424-6147';
const OUT = process.env.OUT_DIR || '.';
const kst = new Date(Date.now() + 9 * 3600 * 1000);
const DATE = kst.toISOString().slice(0, 10);

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const won = p => (p < 1000 ? '가격 문의' : p.toLocaleString('ko-KR') + '원');
const slug = s => s.replace(/[^\w가-힣]+/g, '-').replace(/^-|-$/g, '');
const norm = t => String(t).replace(/20\d\d-\d\d-\d\d/g, "D");
const GTAG = `<script async src="https://www.googletagmanager.com/gtag/js?id=AW-10992718426"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','AW-10992718426');</script>`;
const CALLBAR = `<a class="callbar" href="tel:0415525147" data-ev="phone_click">☎ 전화 문의 041-552-5147</a><script>document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a');if(!a)return;var h=a.getAttribute('href')||'';if(h.indexOf('tel:')===0){gtag('event','phone_click',{page:location.pathname});gtag('event','conversion',{send_to:'AW-10992718426/1mmXCO7t37wdENqk3vko',value:1.0,currency:'KRW'});}else if(h.indexOf('smartstore.naver.com')>-1){gtag('event','smartstore_click',{page:location.pathname});gtag('event','conversion',{send_to:'AW-10992718426/fInNCKmw4bwdENqk3vko',value:1.0,currency:'KRW'});}else if(h.indexOf('mailto:')===0){gtag('event','email_click',{page:location.pathname});}});</script>`;
const GSV = '<meta name="google-site-verification" content="L4pVIct_Rk1DVXRkInG2SBiTXcFb6CzTXBi_q62XwH4" />';
const FBV = '<meta name="facebook-domain-verification" content="9f94m3wpw87mx07rieeeg6ub8bg0ch" />';
const inject = (f, t) => { if (!f.endsWith('.html')) return t; if (!t.includes('google-site-verification')) t = t.replace('</head>', GSV + '</head>'); if (!t.includes('facebook-domain-verification')) t = t.replace('</head>', FBV + '</head>'); t = t.replace(/href="style\.css(\?v=\w+)?"/g, 'href="style.css?v=20261121b"'); return !t.includes('AW-10992718426') ? t.replace('</head>', GTAG + '</head>').replace('</body>', CALLBAR + '</body>') : t; };
const wr = async (f, t) => {
  t = inject(f, t);
  try { const old = await fs.readFile(`${OUT}/${f}`, "utf8"); if (norm(old) === norm(t)) return; } catch { /* 새 파일 */ }
  await fs.writeFile(`${OUT}/${f}`, t);
};

// ---------- 데이터 ----------
async function load() {
  const r = await fetch(SRC, { headers: { 'user-agent': 'hwacheon-parts-builder' } });
  if (!r.ok) throw new Error('목록 가져오기 실패 ' + r.status);
  const j = await r.json();
  const rows = String(j.products || '').split('\n')
    .map(s => s.replace(/^- /, '').split(' | ')).filter(a => a.length >= 3)
    .map(a => ({ name: a[0].trim(), price: parseInt(a[1].replace(/[^\d]/g, '')) || 0, url: a[2].trim() }));
  return rows;
}

let images = {};
try { images = JSON.parse(await fs.readFile(`${OUT}/images.json`, 'utf8')); } catch { images = {}; }
let enrich = {};
try { for (const e of JSON.parse(await fs.readFile(`${OUT}/data/products.json`, 'utf8'))) enrich[e.id] = e; } catch { enrich = {}; }
let feedImgOverride = {}; try { feedImgOverride = JSON.parse(await fs.readFile(`${OUT}/data/feed-image-overrides.json`, 'utf8')); } catch { feedImgOverride = {}; } // 머천트센터 500x500 미만 대표이미지 대체

async function ensureImage(id, url) {
  if (images[id]) return;
  try {
    const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } });
    if (!r.ok) return;
    const h = await r.text();
    const m = (h.match(/property="og:image" content="([^"]+)"/) || [])[1];
    if (m) images[id] = m.replace(/\?type=.*$/, '?type=m510');
  } catch { /* 이미지 없이 진행 */ }
}

function classify(rows) {
  const items = rows.map(p => {
    const id = (p.url.match(/products\/(\d+)/) || [])[1];
    const used = /\[중고\]|년식|중고/.test(p.name) && !/신품|미개봉/.test(p.name);
    const lathe = /범용선반|선반/.test(p.name) && /화천/.test(p.name);
    const mill = /범용밀링/.test(p.name) && /화천/.test(p.name);
    const title = p.name.replace(/\s*A\/S 부품 공작기계$/, ' A/S 부품').replace(/\s+공작기계$/, '').replace(/^\[중고\]\s*/, '').trim();
    return { id, name: p.name, title, price: p.price, url: p.url, used, lathe, mill };
  });
  const lg = n => /브레이크|마스터실린더/.test(n) ? '브레이크·마스터실린더' : /방진구/.test(n) ? '방진구' : /체인지기어/.test(n) ? '체인지기어'
    : /공구대|툴포스트/.test(n) ? '공구대(툴포스트)' : /명판/.test(n) ? '명판' : /기어|하프너트|스크류|리드|레버|심압대|척|왕복대/.test(n) ? '기어·이송·변속 부품' : '안전·절삭유·기타';
  const mg = n => /브레이크/.test(n) ? '브레이크' : /모터/.test(n) ? '모터' : /헤드|퀼|스핀들|풀리|판스프링|베어링/.test(n) ? '헤드·퀼·풀리'
    : /핸들|레버|쉬프터|리미트/.test(n) ? '핸들·레버·변속' : /기어|볼스크류|클러치/.test(n) ? '기어·이송 부품' : '안전·윤활·전기·기타';
  const latheItems = items.filter(i => !i.used && i.lathe && !/밀링/.test(i.name.replace(/범용선반 밀링/, ''))).map(i => ({ ...i, group: lg(i.name) }));
  const both = items.filter(i => !i.used && /범용선반 밀링/.test(i.name)).map(i => ({ ...i, group: '안전·절삭유·기타' }));
  const millItems = items.filter(i => !i.used && i.mill).map(i => ({ ...i, group: mg(i.name) }));
  const usedItems = [...new Map(items.filter(i => i.used).map(i => [i.id, i])).values()].map(i => ({
    ...i, group: (/^(중고\s*)?(BT\d+\s*공구|연마바이스|TAKEDA|DAFEI|SMC|제일\s*DSP)/.test(i.name) || /툴홀더|BV-\d|토크렌치|Fluke|얼라인먼트/.test(i.name)) ? '공구·바이스·측정기' : /콤프레|컴프레|트랜스|KVA|집진기|드라이어/.test(i.name) ? '설비·부대장비'
      : /머시닝|MCT|MYNX|Mynx|VESTA|SIRIUS|VM\d|ECOMIL|UT360|REVO/.test(i.name) ? '머시닝센터' : /선반|CUTEX/.test(i.name) ? '선반'
      : /밀링|HMT|KMB|SIMPLEX|라우터|보링|탭핑|톱기계|밴드쏘|밴스쏘/.test(i.name) ? '밀링·보링·기타 가공기' : '설비·부대장비' }));
  const usedIds = new Set(usedItems.map(i => i.id));
  const catIds = new Set([...latheItems, ...both, ...millItems].map(i => i.id));
  const accItems = items.filter(i => !usedIds.has(i.id) && !catIds.has(i.id) && !i.used).map(i => ({
    ...i, group: /절삭유|오일스키머|미스트|집진|YHB|믹스트론|기포/.test(i.name) ? '절삭유 관리·집진' : /칩|컨베이어|콘베이어/.test(i.name) ? '칩 처리'
      : /터치프로브|마이크로미터|디지털스케일|툴홀더|MPG|조그핸들|면취|바이스|척/.test(i.name) ? '측정·공구·조작'
      : /콤프레샤|수분제거|이세퍼레이터|판넬쿨러/.test(i.name) ? '공압·전장 설비' : '신품 기계·기타' }));
  return { items, latheItems, both, millItems, usedItems, accItems };
}

// ---------- 템플릿 ----------
const orgLD = { '@context': 'https://schema.org', '@type': 'LocalBusiness', name: '화천이티씨', alternateName: '화천기계 부품 화천이티씨',
  description: '화천기계 범용선반·범용밀링 A/S 부품 판매, 중고 공작기계 매입·판매, 공작기계 수리', url: BASE, telephone: '+82-41-552-5147',
  address: { '@type': 'PostalAddress', streetAddress: '휴대길 167, 101동', addressLocality: '아산시 배방읍', addressRegion: '충청남도', addressCountry: 'KR' }, sameAs: [STORE], areaServed: 'KR' };
const ld = o => `<script type="application/ld+json">${JSON.stringify(o)}</script>`;
const nav = `<header class="top"><div class="in"><a class="brand" href="index.html">화천이티씨</a><a href="lathe-parts.html">범용선반 부품</a><a href="milling-parts.html">범용밀링 부품</a><a href="models.html">모델별 부품</a><a href="used-machines.html">중고기계</a><a href="accessories.html">주변기기</a><a href="sell-machines.html">매입 문의</a><a href="catalog.html">전체 상품</a><a href="faq.html">자주 묻는 질문</a></div></header>`;
const foot = `<footer><div class="in"><b>화천이티씨</b> (화천기계 범용선반·밀링 정품 A/S 부품 / 중고 공작기계 매매·매입 / 주변기기 판매·공작기계 수리)<br>${TEL} · mohoro@naver.com<br>대표 문형록 · 충남 아산시 배방읍 휴대길 167, 101동(아산매장) · 사업자등록번호 483-26-00262 · 통신판매업신고 제2025-충남아산-0595호<br><a href="returns.html">배송·반품 안내</a> · <a href="${STORE}">스마트스토어 바로가기</a> · <a href="en/" hreflang="en">English (Used machines for export)</a> · 판매가는 부가세 포함 스마트스토어 표시가이며 ${DATE} 기준입니다. 가격과 재고는 스마트스토어에서 최종 확인해 주세요.</div></footer>`;

function page({ path, title, desc, h1, body, extraLD = [], crumbs = [] }) {
  const url = BASE + path;
  const bc = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: '화천이티씨', item: BASE }, ...crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 2, name: c[0], item: BASE + c[1] }))] };
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${url}"><meta property="og:type" content="website"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${url}"><link rel="stylesheet" href="style.css">${ld(orgLD)}${ld(bc)}${extraLD.map(ld).join('')}</head><body>${nav}<main><div class="crumb">${['<a href="index.html">화천이티씨</a>', ...crumbs.map(c => esc(c[0]))].join(' › ')}</div><h1>${esc(h1)}</h1>${body}<div class="cta"><b>필요한 부품이 목록에 없거나 모델이 헷갈리세요?</b><br>기계 명판(모델명·호기)과 필요한 부품 사진을 보내 주시면 확인해 안내드립니다.<br><b>${TEL}</b> · <a href="${STORE}">스마트스토어에서 문의</a></div></main>${foot}</body></html>`;
}
const priceText = i => i.id === '9695469065' ? '1,067,000원부터 (기종별 상이)' : won(i.price);
const card = i => `<article class="p" id="p${i.id}">${images[i.id] ? `<img loading="lazy" src="${esc(images[i.id])}" alt="${esc(i.title)}">` : ''}<div class="b"><h3>${esc(i.title)}</h3><div class="price">${priceText(i)}</div><a class="btn" href="p-${i.id}.html">상세 보기</a> <a class="btn alt" href="${esc(i.url)}" rel="noopener">스마트스토어에서 보기</a></div></article>`;
const itemLD = list => ({ '@context': 'https://schema.org', '@type': 'ItemList', itemListElement: list.map((i, k) => ({ '@type': 'ListItem', position: k + 1, item: { '@type': 'Product', name: i.title, ...(images[i.id] ? { image: images[i.id] } : {}), brand: { '@type': 'Brand', name: /화천/.test(i.name) ? '화천기계 호환' : '화천이티씨' }, url: i.url, offers: { '@type': 'Offer', priceCurrency: 'KRW', ...(i.price >= 1000 ? { price: String(i.price) } : {}), availability: 'https://schema.org/InStock', url: i.url, seller: { '@type': 'Organization', name: '화천이티씨' } } } })) });
function grouped(list, order) {
  const by = {}; list.forEach(i => (by[i.group] = by[i.group] || []).push(i));
  const keys = Object.keys(by).sort((a, b) => (order.indexOf(a) < 0 ? 99 : order.indexOf(a)) - (order.indexOf(b) < 0 ? 99 : order.indexOf(b)));
  return keys.map(k => `<h2 id="${slug(k)}">${esc(k)} (${by[k].length}종)</h2><div class="grid">${by[k].sort((a, b) => a.price - b.price).map(card).join('')}</div>`).join('');
}
const uniq = a => [...new Map(a.map(i => [i.id, i])).values()];

// ---------- 빌드 ----------
const rows = await load();
if (rows.length < 50) throw new Error('상품 수가 너무 적어 중단: ' + rows.length);
const { items, latheItems, both, millItems, usedItems, accItems } = classify(rows);
for (const i of items) { if (!images[i.id] && enrich[i.id]?.images?.length) images[i.id] = enrich[i.id].images[0] + '?type=m510'; else await ensureImage(i.id, i.url); }
await wr('images.json', JSON.stringify(images));

const latheAll = uniq([...latheItems, ...both]), millAll = uniq([...millItems, ...both]);
const order = { lathe: ['브레이크·마스터실린더', '방진구', '체인지기어', '공구대(툴포스트)', '기어·이송·변속 부품', '명판', '안전·절삭유·기타'], mill: ['헤드·퀼·풀리', '모터', '핸들·레버·변속', '브레이크', '기어·이송 부품', '안전·윤활·전기·기타'] };
const bar = (list) => `<div class="box">바로가기: ${[...new Set(list.map(i => i.group))].map(g => `<a href="#${slug(g)}">${esc(g)}</a>`).join(' · ')}</div>`;

await wr('lathe-parts.html', page({ path: 'lathe-parts.html', title: '화천 범용선반 부품 | 브레이크 마스터실린더 방진구 체인지기어 공구대 - 화천이티씨',
  desc: `화천 범용선반(HL380·HL460·HL580·HL720·HL950) A/S 부품 ${latheAll.length}종. 브레이크 마스터실린더, 방진구, 체인지기어, 공구대, 명판, 기어·이송 부품 가격과 구매 링크.`,
  h1: '화천 범용선반 A/S 부품', crumbs: [['화천 범용선반 부품', 'lathe-parts.html']], extraLD: [itemLD(latheAll)],
  body: `<p class="lead">화천기계 범용선반(HL380, HL460, HL580, HL720, HL950 등)에 쓰는 A/S 부품입니다. 브레이크·마스터실린더, 방진구, 체인지기어, 공구대(툴포스트), 명판, 기어·이송 부품 ${latheAll.length}종을 판매합니다. 모델별로 찾으시려면 <a href="models.html">모델별 부품 안내</a>를 확인하세요.</p>${bar(latheAll)}${grouped(latheAll, order.lathe)}` }));

await wr('milling-parts.html', page({ path: 'milling-parts.html', title: '화천 범용밀링 부품 | 헤드 모터 퀼 이송핸들 브레이크 - 화천이티씨',
  desc: `화천 범용밀링 A/S 부품 ${millAll.length}종. 헤드, 퀼 자동이송, 모터, 풀리, 이송핸들, 브레이크, 기어 부품 가격과 구매 링크.`,
  h1: '화천 범용밀링 A/S 부품', crumbs: [['화천 범용밀링 부품', 'milling-parts.html']], extraLD: [itemLD(millAll)],
  body: `<p class="lead">화천기계 범용밀링에 쓰는 A/S 부품입니다. 헤드·퀼·풀리, 모터, 핸들·레버, 브레이크, 기어·이송 부품 ${millAll.length}종을 판매합니다.</p>${bar(millAll)}${grouped(millAll, order.mill)}` }));

// 모델별
const models = ['HL380', 'HL460', 'HL580', 'HL720', 'HL950'];
const modelOf = n => { const m = n.match(/HL\s?(380|460|580|720|950)/g) || []; const s = n.match(/(\d{3})용/); const o = new Set(m.map(x => x.replace(/\s/, ''))); if (s && ['380', '460', '580', '720', '950'].includes(s[1])) o.add('HL' + s[1]); return [...o]; };
const common = latheAll.filter(i => /모든선반 공용/.test(i.name));
const short = i => i.title.replace(/화천기계|화천|범용선반|A\/S 부품|A\/S 교체부품/g, '').replace(/\s+/g, ' ').trim();
const rowsM = models.map(m => { const l = latheAll.filter(i => modelOf(i.name).includes(m)); return `<tr><th>${m}</th><td>${l.length ? l.map(i => `<a href="lathe-parts.html#p${i.id}">${esc(short(i))}</a> (${priceText(i)})`).join('<br>') : '모델 지정 부품은 문의해 주세요'}</td></tr>`; }).join('');
await wr('models.html', page({ path: 'models.html', title: '화천 범용선반 모델별 부품 HL380 HL460 HL580 HL720 HL950 - 화천이티씨',
  desc: '화천 범용선반 HL380, HL460, HL580, HL720, HL950 모델별 A/S 부품 목록: 체인지기어, 방진구, 리드스크류, 안전커버 등.',
  h1: '화천 범용선반 모델별 부품 (HL380·​HL460·​HL580·​HL720·​HL950)', crumbs: [['모델별 부품', 'models.html']],
  body: `<p class="lead">상품명에 모델이 명시된 부품을 모델별로 모았습니다. 같은 부품이라도 호기·연식에 따라 규격이 다를 수 있으니, 주문 전에 기계 명판 사진을 보내 주시면 확인해 드립니다.</p><div class="box">모델별 상세 페이지: ${models.map(x => `<a href="model-${x.toLowerCase()}.html">${x}</a>`).join(' · ')} · <a href="guide.html">주문 가이드</a></div><table><thead><tr><th>모델</th><th>모델 지정 부품</th></tr></thead><tbody>${rowsM}</tbody></table><h2>모델에 관계없이 쓰는 공용 부품</h2><div class="grid">${common.map(card).join('')}</div>` }));
for (const m of models) {
  const list = latheAll.filter(i => modelOf(i.name).includes(m));
  const others = models.filter(x => x !== m).map(x => `<a href="model-${x.toLowerCase()}.html">${x}</a>`).join(' · ');
  await wr(`model-${m.toLowerCase()}.html`, page({ path: `model-${m.toLowerCase()}.html`, title: `화천 범용선반 ${m} 부품 | ${list.length}종 - 화천이티씨`,
    desc: `화천기계 범용선반 ${m}용 A/S 부품 ${list.length}종과 모델 공용 부품. 가격과 스마트스토어 구매 링크. 문의 041-552-5147.`,
    h1: `화천 범용선반 ${m} 부품`, crumbs: [['모델별 부품', 'models.html'], [m, `model-${m.toLowerCase()}.html`]], extraLD: [itemLD(list.concat(common))],
    body: `<p class="lead">화천기계 범용선반 ${m}에 쓰는 A/S 부품입니다. 상품명에 ${m}이(가) 명시된 부품 ${list.length}종과, 모델에 관계없이 쓰는 공용 부품을 모았습니다. 호기·연식에 따라 규격이 다를 수 있어 주문 전에 기계 명판 사진을 보내 주시면 확인해 드립니다.</p><h2>${m} 지정 부품 (${list.length}종)</h2><div class="grid">${[...list].sort((a, b) => a.price - b.price).map(card).join('')}</div><h2>모델 공용 부품</h2><div class="grid">${common.map(card).join('')}</div><h2>다른 모델</h2><div class="box">${others} · <a href="lathe-parts.html">전체 범용선반 부품</a> · <a href="guide.html">주문 가이드</a></div>` }));
}

// 중고기계
await wr('used-machines.html', page({ path: 'used-machines.html', title: '중고 공작기계 중고 머시닝센터 중고선반 중고밀링 판매 | 화천이티씨',
  desc: `중고 머시닝센터(두산·화천·유지인트·하스), 중고 선반, 중고 밀링 등 ${usedItems.length}종 판매·매입. 연식·사양·가격과 스마트스토어 링크.`,
  h1: '중고 공작기계 판매·매입', crumbs: [['중고기계', 'used-machines.html']], extraLD: [itemLD(usedItems)],
  body: `<p class="lead">두산·화천·유지인트·하스 등 중고 머시닝센터와 중고 선반·밀링, 부대 설비를 판매하고 중고 공작기계 매입도 합니다(${DATE} 기준 ${usedItems.length}종, 매일 자동 갱신). 매물은 한 대씩이라 판매 완료된 것은 목록에서 빠집니다. 중고기계는 착불배송 또는 직접 방문(상차도) 조건입니다.</p>${grouped(usedItems, ['머시닝센터', '선반', '밀링·보링·기타 가공기', '설비·부대장비', '공구·바이스·측정기'])}<h2>중고 공작기계 매입</h2><div class="box">사용 중이거나 유휴 상태인 중고 공작기계(머시닝센터, 선반, 밀링 등) 매입 문의를 받습니다. 기종, 연식, 현재 상태 사진을 보내 주세요.<br><b>${TEL}</b></div>` }));

// 주변기기
await wr('accessories.html', page({ path: 'accessories.html', title: '공작기계 주변기기 | 절삭유 관리 오일스키머 집진기 칩버켓 터치프로브 - 화천이티씨',
  desc: `공작기계 주변기기 ${accItems.length}종: 오일스키머, 절삭유 청소기, 미스트 집진기, 칩버켓, 터치프로브, 디지털스케일, 컴프레서 수분제거장치.`,
  h1: '공작기계 주변기기', crumbs: [['주변기기', 'accessories.html']], extraLD: [itemLD(accItems)],
  body: `<p class="lead">공장에서 머시닝센터·선반과 함께 쓰는 주변기기입니다. 절삭유 관리(오일스키머·청소기·혼합기), 집진기, 칩버켓·칩컨베이어, 측정·공구, 공압 설비를 판매합니다.</p>${grouped(accItems, ['절삭유 관리·집진', '칩 처리', '측정·공구·조작', '공압·전장 설비', '신품 기계·기타'])}` }));

// 홈
const findRe = re => items.find(i => re.test(i.name));
const pop = [/브레이크 마스터실린더 A\/S/, /절삭유펌프 쿨런트펌프 A\/S 부품 공작기계$/, /작업등/, /캠스위치/, /Z축 상하이송/, /속도변환명판/].map(findRe).filter(Boolean);
const partCount = uniq([...latheAll, ...millAll]).length;
const home = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>화천기계 범용선반·범용밀링 부품 전문 | 중고 공작기계 매입·판매 - 화천이티씨</title><meta name="description" content="화천기계 범용선반·범용밀링 A/S 부품(브레이크 마스터실린더, 방진구, 체인지기어, 공구대 등), 중고 머시닝센터·선반·밀링 판매·매입, 공작기계 수리. 충남 아산 화천이티씨 041-552-5147."><link rel="canonical" href="${BASE}"><meta property="og:type" content="website"><meta property="og:title" content="화천기계 범용선반·범용밀링 부품 전문 - 화천이티씨"><meta property="og:description" content="화천 범용선반·범용밀링 A/S 부품, 중고 공작기계 판매·매입, 수리"><meta property="og:url" content="${BASE}"><link rel="stylesheet" href="style.css">${ld(orgLD)}${ld({ '@context': 'https://schema.org', '@type': 'WebSite', name: '화천이티씨', url: BASE })}</head><body>${nav}<main><h1>화천 범용선반·범용밀링 A/S 부품 전문, 화천이티씨</h1><p class="lead">화천기계 범용선반(HL380·HL460·HL580·HL720·HL950 등)과 범용밀링에 쓰는 A/S 부품 ${partCount}종, 중고 머시닝센터·선반·밀링 판매와 매입, 공작기계 수리를 하는 충남 아산의 화천이티씨입니다. 필요한 부품 모델과 증상을 알려 주시면 확인해 안내드립니다.</p><div class="cta"><b>${TEL}</b><br>충남 아산시 배방읍 휴대길 167, 101동 · <a href="${STORE}">스마트스토어에서 주문하기</a></div><h2>무엇을 찾으세요?</h2><div class="cards"><a class="card" href="lathe-parts.html"><b>화천 범용선반 부품</b><span>브레이크·마스터실린더, 방진구, 체인지기어, 공구대, 명판 ${latheAll.length}종</span></a><a class="card" href="milling-parts.html"><b>화천 범용밀링 부품</b><span>헤드·퀼, 모터, 핸들, 브레이크, 기어 ${millAll.length}종</span></a><a class="card" href="models.html"><b>모델별 부품 (HL380~HL950)</b><span>모델명으로 부품 찾기</span></a><a class="card" href="used-machines.html"><b>중고 공작기계 판매·매입</b><span>중고 머시닝센터, 선반, 밀링 ${usedItems.length}종</span></a><a class="card" href="accessories.html"><b>공작기계 주변기기</b><span>오일스키머, 집진기, 칩버켓, 터치프로브 등 ${accItems.length}종</span></a><a class="card" href="faq.html"><b>자주 묻는 질문</b><span>구매처, 모델 확인, 견적·세금계산서</span></a></div><h2>모델·주문 안내</h2><div class="box">${models.map(x => `<a href="model-${x.toLowerCase()}.html">${x} 부품</a>`).join(' · ')} · <a href="guide.html">주문 가이드</a></div><h2>기술 가이드</h2><div class="box"><a href="guides.html">브레이크 교체·방진구·나사가공 부품·안전커버 가이드 보기</a></div><h2>자주 찾는 부품</h2><div class="grid">${pop.map(card).join('')}</div><h2>이런 분께 도움이 됩니다</h2><div class="box">화천 범용선반·범용밀링을 사용하는 공장, 학교 실습장, 수리업체에서 고장 난 부품을 빠르게 교체해야 할 때 모델과 부품 사진만 보내 주시면 맞는 부품을 확인해 드립니다. 사업자 거래는 견적서와 세금계산서 발행을 문의해 주세요.</div></main>${foot}</body></html>`;
await wr('index.html', home);


// ================= v2: 상품별 페이지, 허브, 피드, 사이트맵 =================
const cond = i => (enrich[i.id]?.condition) || (i.used ? 'used' : 'new');
const E = i => enrich[i.id] || {};
const exVat = p => Math.round(p / 1.1 / 1000) * 1000;
const kindOf = i => usedSet.has(i.id) ? 'used' : (latheSet.has(i.id) ? 'lathe' : (millSet.has(i.id) ? 'mill' : 'acc'));
const usedSet = new Set(usedItems.map(i => i.id)), latheSet = new Set(latheAll.map(i => i.id)), millSet = new Set(millAll.map(i => i.id));
const itemsAll = uniq([...usedItems, ...latheAll, ...millAll, ...accItems]);
const groupOf = {}; [...usedItems, ...latheAll, ...millAll, ...accItems].forEach(i => { groupOf[i.id] = groupOf[i.id] || i.group; });
const guideOf = n => /브레이크|마스터실린더|캘리퍼/.test(n) ? ['guide-brake.html', '브레이크 교체 가이드'] : /방진구/.test(n) ? ['guide-steady-rest.html', '방진구 선택 가이드']
  : /체인지기어|하프너트|리드스크류|스크류/.test(n) ? ['guide-thread-parts.html', '나사가공 부품 가이드'] : /안전커버|칩커버/.test(n) ? ['guide-safety-cover.html', '안전커버 가이드'] : null;
const brandOf = i => (E(i).brand || (/두산/.test(i.name) ? '두산' : /화천/.test(i.name) ? '화천기계' : /위아|WIA/.test(i.name) ? '위아' : '')) || '';
const modelOfItem = i => { const sp = E(i).specs || []; const m = sp.find(([k]) => /^모델명$|^모델$/.test(k)); return m ? m[1] : null; };
const bodyText = t => {
  t = String(t || '').replace(/구매자\s*차량\s*상차/g, '상차');
  const out = []; let list = [];
  const flush = () => { if (list.length) { out.push(`<ul>${list.join('')}</ul>`); list = []; } };
  for (const raw of String(t || '').split('\n')) {
    const l = raw.trim(); if (!l) continue;
    if (/^■/.test(l)) { flush(); out.push(`<h3>${esc(l.replace(/^■\s*/, ''))}</h3>`); }
    else if (/^[-·•]\s+/.test(l) || /^\d+\.\s+/.test(l)) list.push(`<li>${esc(l.replace(/^([-·•]|\d+\.)\s+/, ''))}</li>`);
    else { flush(); out.push(`<p>${esc(l)}</p>`); }
  }
  flush(); return out.join('');
};
const kindLabel = { used: '중고 공작기계·장비', lathe: '화천 범용선반 부품', mill: '화천 범용밀링 부품', acc: '공작기계 주변기기' };
const kindPage = { used: 'used-machines.html', lathe: 'lathe-parts.html', mill: 'milling-parts.html', acc: 'accessories.html' };
const today = new Date(kst.getTime()); const until = new Date(today.getTime() + 30 * 86400000).toISOString().slice(0, 10);
const productPages = [];

for (const i of itemsAll) {
  const e = E(i), k = kindOf(i), c = cond(i), brand = brandOf(i), model = modelOfItem(i);
  const imgs = (e.images && e.images.length ? e.images : (images[i.id] ? [images[i.id].replace(/\?type=.*$/, '')] : [])).slice(0, 8);
  const priced = i.price >= 1000;
  const sp = (e.specs || []).filter(([a]) => !/소재지|현재 상태|상태/.test(a)).slice(0, 10);
  const yr = e.year || (i.name.match(/((?:19|20)\d\d)년/) || [])[1];
  const place = ((e.text || '').match(/(?:장비 소재지|소재지|위치)\s*[:：]?\s*([가-힣 ]{2,14})/) || [])[1];
  const gd = guideOf(i.name);
  const kindTxt = c === 'used' ? '중고' : '신품';
  const descParts = [`${i.title}`, c === 'used' ? `중고${yr ? ' ' + yr + '년식' : ''}` : '신품 A/S·판매', place ? `소재지 ${place.trim()}` : '', priced ? `판매가 ${won(i.price)}(부가세 포함)` : '가격 문의', '문의 화천이티씨 041-552-5147'].filter(Boolean);
  let desc = descParts.join(' · '); if (desc.length > 158) desc = desc.slice(0, 157) + '…';
  const rel = itemsAll.filter(o => o.id !== i.id && kindOf(o) === k && groupOf[o.id] === groupOf[i.id]).slice(0, 6);
  const relBlock = rel.length ? `<h2>같은 종류 상품</h2><ul class="rel">${rel.map(o => `<li><a href="p-${o.id}.html">${esc(o.title)}</a> · ${priceText(o)}</li>`).join('')}</ul>` : '';
  const specRows = [...(brand ? [['브랜드·제조사', brand]] : []), ...(yr && c === 'used' ? [['연식', yr + '년']] : []), ['상태', c === 'used' ? '중고' : '신품'], ...(place ? [['소재지', place.trim()]] : []), ...sp.filter(([a]) => !/제조사|제조일자|제조연도/.test(a))];
  const specTable = `<table class="spec"><tbody>${specRows.map(([a, b]) => `<tr><th>${esc(a)}</th><td>${esc(b)}</td></tr>`).join('')}</tbody></table>`;
  const fallback = c === 'used' ? `<p>${esc(i.title)} 판매 안내입니다. 연식·사양·현재 상태와 시운전 가능 여부는 문의해 주세요. 중고기계는 착불배송 또는 직접 방문(상차도) 조건입니다.</p>`
    : k === 'lathe' || k === 'mill' ? `<p>${esc(i.title)}입니다. 화천기계 ${k === 'lathe' ? '범용선반' : '범용밀링'}용 A/S 부품이며 모델과 호기에 맞는지 기계 명판 사진으로 확인해 드립니다.</p>` : `<p>${esc(i.title)} 판매 안내입니다. 사양과 설치 조건은 문의해 주세요.</p>`;
  const detail = (e.text && e.text.length > 80) ? bodyText(e.text) : fallback;
  const ldp = { '@context': 'https://schema.org', '@type': 'Product', name: i.title, sku: i.id, ...(model ? { mpn: model } : {}), ...(imgs.length ? { image: imgs } : {}), description: desc,
    ...(brand ? { brand: { '@type': 'Brand', name: brand } } : {}), itemCondition: c === 'used' ? 'https://schema.org/UsedCondition' : 'https://schema.org/NewCondition', category: kindLabel[k],
    ...(priced ? { offers: { '@type': 'Offer', url: `${BASE}p-${i.id}.html`, priceCurrency: 'KRW', price: String(i.price), priceValidUntil: until, availability: 'https://schema.org/InStock', itemCondition: c === 'used' ? 'https://schema.org/UsedCondition' : 'https://schema.org/NewCondition', seller: { '@type': 'Organization', name: '화천이티씨' } } } : {}) };
  const html = page({ path: `p-${i.id}.html`, title: `${i.title}${c === 'used' ? ' 중고' : ''} | 화천이티씨`.slice(0, 90), desc, h1: i.title, crumbs: [[kindLabel[k], kindPage[k]], [i.title, `p-${i.id}.html`]], extraLD: [ldp],
    body: `<div class="pd"><div class="gal">${imgs.map((u, n) => `<img ${n ? 'loading="lazy" ' : ''}src="${esc(u)}?type=w860" alt="${esc(i.title)}${n ? ' ' + (n + 1) : ''}">`).join('')}</div><div class="info"><div class="price">${priceText(i)}${priced ? ' <small>부가세 포함 판매가(부가세 별도 약 ' + won(exVat(i.price)) + ')</small>' : ''}</div><ul class="facts"><li>상태: ${kindTxt}</li>${yr && c === 'used' ? `<li>연식: ${yr}년</li>` : ''}${place ? `<li>소재지: ${esc(place.trim())}</li>` : ''}<li>판매: 스마트스토어 · 전화 문의</li></ul><p class="act"><a class="btn buy" href="${esc(i.url)}" rel="noopener">스마트스토어에서 구매하기</a> <a class="btn tel" href="tel:0415525147">전화 문의 041-552-5147</a></p></div></div><h2>상품 정보</h2>${specTable}<h2>상세 설명</h2><div class="desc">${detail}</div>${gd ? `<h2>함께 보면 좋은 가이드</h2><p><a href="${gd[0]}">${gd[1]}</a></p>` : ''}${relBlock}` });
  await wr(`p-${i.id}.html`, html);
  productPages.push({ id: i.id, title: i.title, kind: k, cond: c, price: i.price, brand, group: groupOf[i.id] });
}

// 허브 페이지: 중고 머시닝센터 / 선반 / 밀링·보링 / 브랜드별 / 전체 카탈로그
const usedBy = g => usedItems.filter(i => i.group === g);
const hubPage = (path, h1, title, desc, list, lead, extra = '') => page({ path, title, desc, h1, crumbs: [['중고기계', 'used-machines.html'], [h1, path]], extraLD: [itemLD(list)],
  body: `<p class="lead">${lead}</p><div class="grid">${[...list].sort((a, b) => a.price - b.price).map(card).join('')}</div>${extra}` });
const mc = usedBy('머시닝센터'), lt = usedBy('선반'), mb = usedBy('밀링·보링·기타 가공기');
await wr('used-machining-centers.html', hubPage('used-machining-centers.html', '중고 머시닝센터', `중고 머시닝센터 판매 ${mc.length}대 | 두산·화천·위아·유지인트 - 화천이티씨`, `중고 머시닝센터(두산 VM·Mynx, 화천 VESTA·SIRIUS·ECOMIL, 위아 VX500 등) ${mc.length}대. 연식, 호기, 가격, 소재지.`, mc,
  `중고 머시닝센터 ${mc.length}대 목록입니다(${DATE} 기준, 매일 자동 갱신). 호기는 모델명 숫자가 아니라 X축 이송거리 기준입니다(5호기 약 1,000mm, 6.5호기 약 1,300mm, 8.5호기 약 2,000mm). 매물은 한 대씩이라 판매 완료된 것은 목록에서 빠집니다. 중고기계는 착불배송 또는 직접 방문(상차도) 조건입니다.`));
await wr('used-lathes.html', hubPage('used-lathes.html', '중고 선반 (CNC선반·범용선반)', `중고 선반 판매 ${lt.length}대 | CNC선반 범용선반 - 화천이티씨`, `중고 CNC선반과 범용선반(화천 HL460·SMART, 통일 TIPL-4, 지오엠티 NARA 등) ${lt.length}대 판매.`, lt,
  `중고 CNC선반과 범용선반 ${lt.length}대 목록입니다(${DATE} 기준). 연식, 방진구·디지털스케일 등 포함 구성, 소재지는 각 상품 페이지에서 확인하세요.`));
await wr('used-milling.html', hubPage('used-milling.html', '중고 밀링·보링·기타 가공기', `중고 밀링 판매 ${mb.length}대 | 범용밀링 복합밀링 보링 라우터 - 화천이티씨`, `중고 범용밀링, 복합밀링, 베드밀링, 수평 보링기, CNC 라우터 등 ${mb.length}대 판매.`, mb,
  `중고 밀링, 보링기, 라우터 등 ${mb.length}대 목록입니다(${DATE} 기준).`));
const brandGroups = [['두산', /두산|DOOSAN|Mynx|VM\d/i], ['화천기계', /화천|HWACHEON|VESTA|SIRIUS|ECOMIL|CUTEX|HMT/i], ['위아', /위아|WIA/i]];
for (const [bn, re] of brandGroups) {
  const list = usedItems.filter(i => re.test(i.name)); if (list.length < 2) continue;
  const slugb = bn === '두산' ? 'doosan' : bn === '위아' ? 'wia' : 'hwacheon';
  await wr(`used-${slugb}.html`, hubPage(`used-${slugb}.html`, `${bn} 중고 공작기계`, `${bn} 중고 머시닝센터·선반·밀링 ${list.length}대 | 화천이티씨`, `${bn} 중고 공작기계 ${list.length}대: 연식, 사양, 가격, 소재지.`, list, `${bn} 중고 공작기계 ${list.length}대 목록입니다(${DATE} 기준, 매일 자동 갱신).`));
}
// 매입 안내
await wr('sell-machines.html', page({ path: 'sell-machines.html', title: '중고 공작기계 매입 | 머시닝센터 CNC선반 밀링 주변기기 매입 문의 - 화천이티씨', desc: '중고 머시닝센터, CNC선반, 범용선반·밀링, 바이스·콤프레샤·툴홀더 등 공작기계와 주변기기 매입 문의. 기종·연식·사진을 보내 주시면 견적을 안내합니다. 041-552-5147.',
  h1: '중고 공작기계 매입 문의', crumbs: [['매입 문의', 'sell-machines.html']],
  body: `<p class="lead">사용 중이거나 유휴 상태인 중고 공작기계를 매입하거나 위탁판매해 드립니다. 명판 사진과 전체 사진만 보내 주시면 국내 중고 시세를 조사해 보통 1~2일 안에 매입가를 안내합니다.</p><div class="cta"><b>가장 빠른 방법: 사진을 문자로 보내 주세요</b><br>명판 사진, 전체 사진, 소재지를 문자로 보내 주시면 됩니다.<br><a class="btn" href="sms:01054246147" data-ev="sell_sms_click">사진 문자 보내기 010-5424-6147</a> <a class="btn alt" href="tel:0415525147" data-ev="phone_click">전화 041-552-5147</a></div><h2>매입 또는 위탁판매, 고르실 수 있습니다</h2><ul><li><b>바로 매입</b>: 시세 조사 후 매입가를 제시하고, 합의되면 대금을 지급하고 반출합니다.</li><li><b>위탁판매</b>: 기계는 현장에 그대로 두고 저희가 판매합니다. 네이버 스마트스토어, 지마켓·옥션, 번개장터, 자사 홈페이지, 블로그, 해외 바이어용 영문 페이지에 동시에 올려 판매하며, 판매되면 협의한 수수료만 받습니다. 고가 장비나 급하지 않은 장비에 유리합니다.</li></ul><h2>매입 문의 품목</h2><ul><li>중고 머시닝센터(수직·수평), CNC선반, 복합기</li><li>중고 범용선반, 범용밀링, 보링기, 라우터</li><li>주변기기: 바이스, 콤프레샤, BT40·BT50 툴홀더와 공구, 보루방(드릴프레스), 집진기, 다운트랜스, 칩버켓 등</li><li>기계 본체가 아니어도 일괄 정리하실 때는 품목 목록과 사진을 함께 보내 주세요.</li></ul><h2>문의 시 알려 주실 것</h2><ul><li>제조사와 모델명, 호기, 제조연도(명판 사진)</li><li>컨트롤러(예: FANUC 0i-MC), 주요 옵션</li><li>현재 가동 여부와 상태, 소재지</li><li>전체 사진과 명판 사진, 가능하면 가동 영상</li></ul><h2>문의처</h2><div class="box"><b>${TEL}</b><br>충남 아산시 배방읍 휴대길 167, 101동 · 이메일 mohoro@naver.com</div><p>판매 중인 중고기계는 <a href="used-machines.html">중고 공작기계 판매 목록</a>에서 볼 수 있습니다.</p>` }));
// 전체 상품 카탈로그
const byKind = k => productPages.filter(p => p.kind === k).sort((a, b) => a.title.localeCompare(b.title, 'ko'));
await wr('catalog.html', page({ path: 'catalog.html', title: `전체 상품 목록 ${itemsAll.length}종 | 화천이티씨`, desc: `화천이티씨 판매 상품 전체 ${itemsAll.length}종: 중고 공작기계, 화천 범용선반·밀링 부품, 주변기기.`, h1: `전체 상품 목록 (${itemsAll.length}종)`, crumbs: [['전체 상품', 'catalog.html']],
  body: `<p class="lead">${DATE} 기준 판매 중인 전체 상품입니다. 매일 자동 갱신됩니다.</p>${['used', 'lathe', 'mill', 'acc'].map(k => `<h2>${kindLabel[k]} (${byKind(k).length}종)</h2><ul class="rel">${byKind(k).map(p => `<li><a href="p-${p.id}.html">${esc(p.title)}</a>${p.price >= 1000 ? ' · ' + won(p.price) : ''}</li>`).join('')}</ul>`).join('')}` }));

// 정적 페이지 상단 메뉴 통일
for (const f of ['faq.html', 'guide.html', 'guides.html', 'returns.html', 'guide-brake.html', 'guide-steady-rest.html', 'guide-thread-parts.html', 'guide-safety-cover.html', 'guide-lathe-tips.html', 'guide-milling-tips.html']) {
  try { const t = await fs.readFile(`${OUT}/${f}`, 'utf8'); const n = t.replace(/<header class="top">[\s\S]*?<\/header>/, nav); if (n !== t) await fs.writeFile(`${OUT}/${f}`, n); } catch { /* 없는 파일 */ }
}

// 구글 판매자 센터 피드 (전체 상품: 신품 부품 + 중고기계 + 주변기기)
const cleanDesc = t => String(t || '').replace(/구매자\s*차량\s*상차/g, '상차').replace(/(?:(?:가격|금액|개당)\s*[:：]?\s*)?[\d,]+\s*(?:만원|원)?\s*\(?\s*vat\s*별도가?\s*\)?/gi, ' ').replace(/(문의[:：]?\s*)?화천이티씨\s*041-552-5147\s*\/\s*모바일\s*010-5424-6147/g, ' ').replace(/\(\s*\)/g, '').replace(/\s+/g, ' ').trim();
const clean = s => String(s).replace(/[\t\r\n]+/g, ' ').trim();
const hdr = ['id', 'title', 'description', 'link', 'image_link', 'additional_image_link', 'availability', 'price', 'condition', 'brand', 'mpn', 'identifier_exists', 'product_type', 'product_highlight', 'custom_label_0'];
const feedRows = [];
for (const i of itemsAll) {
  const e = E(i), k = kindOf(i), c = cond(i);
  const imgsF0 = (e.images && e.images.length ? e.images : (images[i.id] ? [images[i.id].replace(/\?type=.*$/, '')] : []));
  const ov = feedImgOverride[i.id];
  const imgsF = ov ? [ov, ...imgsF0.filter(u => u !== ov)] : imgsF0;
  if (i.price < 1000 || !imgsF.length) continue;
  const brand = brandOf(i) || '화천이티씨', model = modelOfItem(i);
  const yr = e.year || (i.name.match(/((?:19|20)\d\d)년/) || [])[1];
  const t = clean(i.title).slice(0, 150);
  const lead = c === 'used' ? `${t}. 중고${yr ? ' ' + yr + '년식' : ''} 공작기계·장비입니다.` : k === 'lathe' ? `${t}. 화천기계 범용선반 A/S 부품입니다.` : k === 'mill' ? `${t}. 화천기계 범용밀링 A/S 부품입니다.` : `${t}. 공작기계 주변기기입니다.`;
  const d = clean(`${lead} ${cleanDesc(e.text).slice(0, 600)} 문의 ${TEL}`).slice(0, 4900);
  const hl = [c === 'used' ? `중고${yr ? ' ' + yr + '년식' : ''}` : '신품', ...(e.specs || []).filter(([a, b]) => !/가격|금액|vat/i.test(a + b)).slice(0, 4).map(([a, b]) => `${a}: ${b}`.slice(0, 140)), '충남 아산 화천이티씨 041-552-5147'].slice(0, 6);
  const ptype = c === 'used' ? `중고 공작기계 > ${i.group}` : k === 'acc' ? `공작기계 주변기기 > ${i.group}` : `공작기계 부품 > ${k === 'lathe' ? '범용선반' : '범용밀링'}`;
  feedRows.push([`hc-${i.id}`, t, d, `${BASE}p-${i.id}.html`, imgsF[0], imgsF.slice(1, 6).join(','), 'in_stock', `${i.price} KRW`, c, brand, model || '', 'no', ptype, hl.join('|'), c === 'used' ? 'used' : k]);
}
await wr('feed.tsv', [hdr.join('\t'), ...feedRows.map(r => r.map(clean).join('\t'))].join('\n'));

// 사이트맵
const staticPages = ['', 'lathe-parts.html', 'milling-parts.html', 'models.html', 'used-machines.html', 'used-machining-centers.html', 'used-lathes.html', 'used-milling.html', 'accessories.html', 'catalog.html', 'sell-machines.html', 'faq.html', 'guide.html', 'guides.html', 'returns.html',
  ...models.map(x => `model-${x.toLowerCase()}.html`), 'guide-brake.html', 'guide-steady-rest.html', 'guide-thread-parts.html', 'guide-safety-cover.html', 'guide-lathe-tips.html', 'guide-milling-tips.html',
  'used-doosan.html', 'used-hwacheon.html', 'used-wia.html'];
const allUrls = [...staticPages, ...productPages.map(p => `p-${p.id}.html`)];
const existing = []; for (const p of allUrls) { if (p === '') { existing.push(p); continue; } try { await fs.access(`${OUT}/${p}`); existing.push(p); } catch { /* 없는 허브 제외 */ } }
await wr('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${existing.map(p => `<url><loc>${BASE}${p}</loc><lastmod>${DATE}</lastmod></url>`).join('\n')}\n</urlset>\n`);
await wr('indexnow-urls.json', JSON.stringify(existing.map(p => BASE + p)));

// llms.txt
await wr('llms.txt', `# 화천이티씨\n> 화천기계 범용선반·범용밀링 A/S 부품 판매, 중고 공작기계(머시닝센터·CNC선반·선반·밀링) 판매·매입, 공작기계 수리 (충남 아산). 문의 ${TEL}\n\n- 스마트스토어: ${STORE}\n- 주소: 충남 아산시 배방읍 휴대길 167, 101동\n- 전체 상품 목록: ${BASE}catalog.html\n- 갱신일: ${DATE}\n\n## 주요 페이지\n- [중고 머시닝센터](${BASE}used-machining-centers.html)\n- [중고 선반(CNC선반·범용선반)](${BASE}used-lathes.html)\n- [중고 밀링·보링·기타](${BASE}used-milling.html)\n- [중고 공작기계 매입 문의](${BASE}sell-machines.html)\n- [화천 범용선반 부품](${BASE}lathe-parts.html)\n- [화천 범용밀링 부품](${BASE}milling-parts.html)\n- [모델별 부품 HL380~HL950](${BASE}models.html)\n- [공작기계 주변기기](${BASE}accessories.html)\n- [자주 묻는 질문](${BASE}faq.html)\n- [주문 가이드](${BASE}guide.html)\n- [배송·반품·교환](${BASE}returns.html)\n\n## 상품 페이지\n${productPages.map(p => `- [${p.title}](${BASE}p-${p.id}.html)`).join('\n')}\n`);

console.log(JSON.stringify({ products: rows.length, pages: productPages.length, latheAll: latheAll.length, millAll: millAll.length, used: usedItems.length, acc: accItems.length, feed: feedRows.length, urls: existing.length, date: DATE }));
