// 화천이티씨 부품 사이트 자동 갱신 스크립트
// 스마트스토어 판매중 상품 목록(챗봇 동기화 주소, 읽기 전용)을 읽어 동적 페이지와 구글 피드를 다시 만든다.
// 정적 가이드 페이지(guide*.html, faq.html, returns.html 등)는 건드리지 않는다.
import fs from 'node:fs/promises';

const SRC = 'https://chatbot-tawny-six-65.vercel.app/api/sync-products';
const BASE = 'https://psk5147-bot.github.io/hwacheon-parts/';
const STORE = 'https://smartstore.naver.com/hwacheonetc';
const TEL = '화천이티씨 041-552-5147 / 모바일 010-5424-6147';
const OUT = process.env.OUT_DIR || '.';
const kst = new Date(Date.now() + 9 * 3600 * 1000);
const DATE = kst.toISOString().slice(0, 10);

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const won = p => (p < 1000 ? '가격 문의' : p.toLocaleString('ko-KR') + '원');
const slug = s => s.replace(/[^\w가-힣]+/g, '-').replace(/^-|-$/g, '');
const norm = t => String(t).replace(/20\d\d-\d\d-\d\d/g, "D");
const wr = async (f, t) => {
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
    ...i, group: /바이스|BV-/.test(i.name) ? '바이스·공구' : /콤프레|컴프레|트랜스|KVA|집진기|Fluke|톱기계/.test(i.name) ? '설비·부대장비'
      : /머시닝|MCT|MYNX|Mynx|VESTA|SIRIUS|VM\d|ECOMIL|UT360|REVO|BT50 공구/.test(i.name) ? '머시닝센터' : /선반|CUTEX/.test(i.name) ? '선반'
      : /밀링|HMT|KMB|SIMPLEX|라우터|보링/.test(i.name) ? '밀링·보링·기타 가공기' : '설비·부대장비' }));
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
const nav = `<header class="top"><div class="in"><a class="brand" href="index.html">화천이티씨</a><a href="lathe-parts.html">범용선반 부품</a><a href="milling-parts.html">범용밀링 부품</a><a href="models.html">모델별 부품</a><a href="used-machines.html">중고기계</a><a href="accessories.html">주변기기</a><a href="faq.html">자주 묻는 질문</a></div></header>`;
const foot = `<footer><div class="in"><b>화천이티씨</b> ((주)화천기계 신품판매 / 중고공작기계 매입·판매 / 부품·주변기기 판매 / 공작기계 수리)<br>${TEL}<br>충남 아산시 배방읍 휴대길 167, 101동 · 사업자등록번호 483-26-00262<br><a href="returns.html">배송·반품 안내</a> · <a href="${STORE}">스마트스토어 바로가기</a> · 판매가는 부가세 포함 스마트스토어 표시가이며 ${DATE} 기준입니다. 가격과 재고는 스마트스토어에서 최종 확인해 주세요.</div></footer>`;

function page({ path, title, desc, h1, body, extraLD = [], crumbs = [] }) {
  const url = BASE + path;
  const bc = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: '화천이티씨', item: BASE }, ...crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 2, name: c[0], item: BASE + c[1] }))] };
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${url}"><meta property="og:type" content="website"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${url}"><link rel="stylesheet" href="style.css">${ld(orgLD)}${ld(bc)}${extraLD.map(ld).join('')}</head><body>${nav}<main><div class="crumb">${['<a href="index.html">화천이티씨</a>', ...crumbs.map(c => esc(c[0]))].join(' › ')}</div><h1>${esc(h1)}</h1>${body}<div class="cta"><b>필요한 부품이 목록에 없거나 모델이 헷갈리세요?</b><br>기계 명판(모델명·호기)과 필요한 부품 사진을 보내 주시면 확인해 안내드립니다.<br><b>${TEL}</b> · <a href="${STORE}">스마트스토어에서 문의</a></div></main>${foot}</body></html>`;
}
const priceText = i => i.id === '9695469065' ? '1,067,000원부터 (기종별 상이)' : won(i.price);
const card = i => `<article class="p" id="p${i.id}">${images[i.id] ? `<img loading="lazy" src="${esc(images[i.id])}" alt="${esc(i.title)}">` : ''}<div class="b"><h3>${esc(i.title)}</h3><div class="price">${priceText(i)}</div><a class="btn" href="${esc(i.url)}" rel="noopener">스마트스토어에서 보기</a></div></article>`;
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
for (const i of items) await ensureImage(i.id, i.url);
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
  h1: '화천 범용선반 모델별 부품 (HL380·HL460·HL580·HL720·HL950)', crumbs: [['모델별 부품', 'models.html']],
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
  body: `<p class="lead">두산·화천·유지인트·하스 등 중고 머시닝센터와 중고 선반·밀링, 부대 설비를 판매하고 중고 공작기계 매입도 합니다(${DATE} 기준 ${usedItems.length}종, 매일 자동 갱신). 매물은 한 대씩이라 판매 완료된 것은 목록에서 빠집니다. 중고기계는 착불배송 또는 직접 방문(상차도) 조건입니다.</p>${grouped(usedItems, ['머시닝센터', '선반', '밀링·보링·기타 가공기', '설비·부대장비', '바이스·공구'])}<h2>중고 공작기계 매입</h2><div class="box">사용 중이거나 유휴 상태인 중고 공작기계(머시닝센터, 선반, 밀링 등) 매입 문의를 받습니다. 기종, 연식, 현재 상태 사진을 보내 주세요.<br><b>${TEL}</b></div>` }));

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

// 구글 판매자 센터 피드 (신품 부품만, 이미지 있는 것만)
const feedItems = uniq([...latheAll, ...millAll]).filter(i => i.price >= 1000 && images[i.id]);
const clean = s => String(s).replace(/[\t\r\n]+/g, ' ').trim();
const hdr = ['id', 'title', 'description', 'link', 'image_link', 'availability', 'price', 'condition', 'brand', 'identifier_exists', 'product_type', 'google_product_category'];
const feedRows = feedItems.map(i => {
  const pg = i.lathe ? 'lathe-parts.html' : 'milling-parts.html';
  const kind = (i.lathe && i.mill) ? '범용선반·범용밀링' : (i.lathe ? '범용선반' : '범용밀링');
  const t = clean(i.title).slice(0, 150);
  const d = clean(`${t}. 화천기계 ${kind} A/S 부품. 모델과 호기에 맞는지 기계 명판 사진으로 확인해 드립니다. 문의 ${TEL}`);
  return [`hc-${i.id}`, t, d, `${BASE}${pg}#p${i.id}`, images[i.id].replace(/\?type=.*$/, ''), 'in_stock', `${i.price} KRW`, 'new', '화천이티씨', 'no', `공작기계 부품 > ${kind}`, ''];
});
await wr('feed.tsv', [hdr.join('\t'), ...feedRows.map(r => r.join('\t'))].join('\n'));

// 사이트맵 (lastmod 갱신)
const pages = ['', 'lathe-parts.html', 'milling-parts.html', 'models.html', 'used-machines.html', 'accessories.html', 'faq.html', 'guide.html', 'guides.html', 'returns.html',
  ...models.map(x => `model-${x.toLowerCase()}.html`), 'guide-brake.html', 'guide-steady-rest.html', 'guide-thread-parts.html', 'guide-safety-cover.html', 'guide-lathe-tips.html', 'guide-milling-tips.html'];
await wr('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map(p => `<url><loc>${BASE}${p}</loc><lastmod>${DATE}</lastmod></url>`).join('\n')}\n</urlset>\n`);

console.log(JSON.stringify({ products: rows.length, latheAll: latheAll.length, millAll: millAll.length, used: usedItems.length, acc: accItems.length, feed: feedRows.length, date: DATE }));
