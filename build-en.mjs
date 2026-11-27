// English export pages for used machines (hwacheonetc.com/en/)
// Runs after build.mjs. Reads the same store list, writes en/*.html, and appends en URLs to sitemap.xml and indexnow-urls.json.
// Curated English data lives in data/en.json (id -> title/specs). Machines without an entry get an automatic English title.
import fs from 'node:fs/promises';

const SRC = 'https://chatbot-tawny-six-65.vercel.app/api/sync-products';
const BASE = 'https://hwacheonetc.com/';
const OUT = process.env.OUT_DIR || '.';
const EMAIL = 'mohoro@naver.com';
const PHONE = '+82-10-5424-6147';
const OFFICE = '+82-41-552-5147';
const kst = new Date(Date.now() + 9 * 3600 * 1000);
const DATE = kst.toISOString().slice(0, 10);
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const krw = n => 'KRW ' + Math.round(n).toLocaleString('en-US');
const GTAG = `<script async src="https://www.googletagmanager.com/gtag/js?id=AW-10992718426"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','AW-10992718426');document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a[data-ev]');if(a)gtag('event',a.getAttribute('data-ev'),{page_location:location.href});});</script>`;
const GSV = '<meta name="google-site-verification" content="L4pVIct_Rk1DVXRkInG2SBiTXcFb6CzTXBi_q62XwH4" />';

const r = await fetch(SRC, { headers: { 'user-agent': 'hwacheon-parts-builder' } });
if (!r.ok) throw new Error('store list fetch failed ' + r.status);
const rows = String((await r.json()).products || '').split('\n').map(s => s.replace(/^- /, '').split(' | ')).filter(a => a.length >= 3)
  .map(a => ({ name: a[0].trim(), price: parseInt(a[1].replace(/[^\d]/g, '')) || 0, url: a[2].trim(), id: (a[2].match(/products\/(\d+)/) || [])[1] }));
let en = {}; try { en = JSON.parse(await fs.readFile(`${OUT}/data/en.json`, 'utf8')); } catch { en = {}; }
let enrich = {}; try { for (const e of JSON.parse(await fs.readFile(`${OUT}/data/products.json`, 'utf8'))) enrich[e.id] = e; } catch { enrich = {}; }
let images = {}; try { images = JSON.parse(await fs.readFile(`${OUT}/images.json`, 'utf8')); } catch { images = {}; }

const isUsed = n => /\[중고\]|년식|중고/.test(n) && !/신품|미개봉/.test(n);
const isMachine = n => /머시닝|MCT|선반|밀링|보링|라우터|콤프레|컴프레|VESTA|SIRIUS|ECOMIL|Mynx|VM\d|VX\d|CUTEX/i.test(n);
const dict = [[/두산인프라코어|두산/g, 'Doosan'], [/화천기계|화천/g, 'Hwacheon'], [/현대위아|위아/g, 'Hyundai WIA'], [/통일중공업|통일/g, 'Tongil'], [/남선기공|남선/g, 'Namsun'], [/기흥/g, 'Kiheung'], [/지오엠티/g, 'GOMT'], [/경원/g, 'Kyungwon'], [/시바우라/g, 'Shibaura'],
  [/수직머시닝센터|머시닝센타|머시닝센터|MCT/g, 'Machining Center'], [/CNC선반/g, 'CNC Lathe'], [/범용선반/g, 'Lathe'], [/선반/g, 'Lathe'], [/복합밀링|범용밀링|밀링머신|베드밀링|밀링/g, 'Milling Machine'], [/수평 보링기|보링기/g, 'Boring Machine'], [/라우터기|라우터/g, 'CNC Router'],
  [/스크류콤프레샤|콤프레샤|컴프레서/g, 'Air Compressor'], [/(\d+(?:\.\d)?)호기/g, ''], [/((?:19|20)\d\d)(?:\.\d\d월|년\s?\d{1,2}월)?식|((?:19|20)\d\d)년/g, '$1$2'], [/디지털(\d)축/g, '$1-axis DRO'], [/방진구/g, 'steady rest'], [/칩콘베어|칩컨베어/g, 'chip conveyor'], [/심압대/g, 'tailstock'], [/공구일체포함|공구일체/g, 'with tooling'], [/중고|공작기계|CNC 가공기|가공기|현장가동중|판매/g, '']];
const autoTitle = n => { let t = n.replace(/^\[중고\]\s*/, ''); for (const [a, b] of dict) t = t.replace(a, b); t = t.replace(/[가-힣]+/g, '').replace(/\(\s*\)/g, '').replace(/\s{2,}/g, ' ').trim(); return t || 'Used Machine Tool'; };

const items = [...new Map(rows.filter(p => p.id && isUsed(p.name) && (en[p.id] || (isMachine(p.name) && p.price >= 3000000))).map(p => [p.id, p])).values()].map(p => {
  const c = en[p.id] || {}; const e = enrich[p.id] || {};
  const year = c.year || e.year || (p.name.match(/((?:19|20)\d\d)/) || [])[1] || '';
  const type = c.type || (/라우터/.test(p.name) ? 'CNC Router' : /보링/.test(p.name) ? 'Boring Machine' : /콤프|컴프/.test(p.name) ? 'Air Compressor' : /CNC선반|CUTEX/.test(p.name) ? 'CNC Lathe' : /선반/.test(p.name) ? 'Conventional Lathe' : /밀링/.test(p.name) ? 'Milling Machine' : 'Machining Center');
  const imgs = (e.images && e.images.length ? e.images : (images[p.id] ? [images[p.id].replace(/\?type=.*$/, '')] : [])).slice(0, 8);
  return { ...p, title: c.title || `Used ${autoTitle(p.name)}`, type, brand: c.brand || '', year, specs: c.specs || [['Model', autoTitle(p.name)], ...(year ? [['Year', year]] : [])], curated: !!en[p.id], imgs, exVat: p.price / 1.1 };
});
const groupOrder = ['Vertical Machining Center', 'CNC Lathe', 'Conventional Lathe', 'Universal Milling Machine', 'Conventional Milling Machine', 'Bed Type Milling Machine', 'Milling Machine', 'CNC Horizontal Boring Machine', 'Boring Machine', 'CNC Router', 'Screw Air Compressor', 'Air Compressor'];
const plural = t => t.endsWith('Machine') ? t + 's' : t.endsWith('Center') ? t + 's' : t.endsWith('Lathe') ? t + 's' : t + 's';

const css = `body{margin:0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1d2733;background:#f5f7fa;line-height:1.55}a{color:#0b5cad}header{background:#0b3d7a;color:#fff}header .in,main,footer .in{max-width:1080px;margin:0 auto;padding:12px 16px}header a{color:#fff;text-decoration:none;margin-right:18px;font-weight:600}header .brand{font-size:20px}h1{font-size:26px;margin:18px 0 8px}h2{font-size:20px;margin:28px 0 10px}.lead{font-size:16px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px}.p{background:#fff;border:1px solid #dfe5ec;border-radius:10px;overflow:hidden}.p img{width:100%;height:180px;object-fit:cover;background:#eef2f6}.p .b{padding:10px 12px}.p h3{font-size:15px;margin:0 0 6px}.price{font-weight:700;color:#0b3d7a}.price small{font-weight:400;color:#5a6876}.btn{display:inline-block;background:#0b3d7a;color:#fff;padding:8px 14px;border-radius:7px;text-decoration:none;font-weight:600;margin:4px 6px 4px 0}.btn.alt{background:#1f8a4c}.box{background:#fff;border:1px solid #dfe5ec;border-radius:10px;padding:14px 16px}.cta{background:#e8f1fb;border:1px solid #c4daf2;border-radius:10px;padding:14px 16px;margin:22px 0}table.spec{border-collapse:collapse;width:100%;background:#fff}table.spec th,table.spec td{border:1px solid #dfe5ec;padding:8px 10px;text-align:left;vertical-align:top}table.spec th{width:32%;background:#f0f4f8}.gal{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:8px}.gal img{width:100%;border-radius:8px}.crumb{font-size:13px;color:#5a6876;margin-top:10px}footer{background:#1d2733;color:#cfd8e2;margin-top:40px;font-size:14px}footer a{color:#9cc7ff}ul.why li{margin:4px 0}`;
const head = (path, title, desc, ld = []) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${BASE}${path}"><meta property="og:type" content="website"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${BASE}${path}">${GSV}<style>${css}</style>${ld.map(o => `<script type="application/ld+json">${JSON.stringify(o)}</script>`).join('')}${GTAG}</head><body><header><div class="in"><a class="brand" href="${BASE}en/">HWACHEON ETC</a><a href="${BASE}en/">Used CNC Machines</a><a href="${BASE}en/contact.html">Contact</a><a href="${BASE}" hreflang="ko">한국어</a></div></header><main>`;
const mail = subj => `mailto:${EMAIL}?subject=${encodeURIComponent(subj)}`;
const contactBox = subj => `<div class="cta"><b>Export inquiry</b><br>Email us in English. We reply within 1 business day (Korea time).<br><a class="btn" href="${mail(subj)}" data-ev="en_email_click">Email ${EMAIL}</a> <a class="btn alt" href="tel:${PHONE.replace(/-/g, '')}" data-ev="en_phone_click">Call ${PHONE}</a><br><small>Please tell us your country, destination port and the machines you are interested in.</small></div>`;
const foot = `</main><footer><div class="in"><b>HWACHEON ETC</b> (화천이티씨), used machine tool dealer and Hwacheon Machinery parts distributor<br>167 Hyudae-gil, Baebang-eup, Asan-si, Chungcheongnam-do, Republic of Korea · Business registration 483-26-00262<br>Email ${EMAIL} · Mobile ${PHONE} · Office ${OFFICE}<br>Machines are sold one unit each. Listings are updated daily (${DATE}); sold machines are removed.</div></footer></body></html>`;
const org = { '@context': 'https://schema.org', '@type': 'Organization', name: 'HWACHEON ETC', alternateName: '화천이티씨', url: BASE + 'en/', email: EMAIL, telephone: PHONE, address: { '@type': 'PostalAddress', streetAddress: '167 Hyudae-gil, Baebang-eup', addressLocality: 'Asan-si', addressRegion: 'Chungcheongnam-do', addressCountry: 'KR' } };
const priceLine = i => `${krw(i.exVat)} <small>(price in Korea excl. VAT; export quotation EXW or FOB Korean port on request)</small>`;
const card = i => `<article class="p">${i.imgs[0] ? `<img loading="lazy" src="${esc(i.imgs[0])}?type=m510" alt="${esc(i.title)}">` : ''}<div class="b"><h3>${esc(i.title)}</h3><div class="price">${krw(i.exVat)}</div><a class="btn" href="${BASE}en/m-${i.id}.html">Details</a></div></article>`;

await fs.mkdir(`${OUT}/en`, { recursive: true });
const urls = [];
const write = async (f, html) => { await fs.writeFile(`${OUT}/en/${f}`, html); urls.push(`${BASE}en/${f === 'index.html' ? '' : f}`); };

// product pages
for (const i of items) {
  const desc = `${i.title}. Used ${i.type.toLowerCase()} from South Korea, available for export. ${krw(i.exVat)} excl. VAT. Inspection video and export quotation on request.`.slice(0, 160);
  const ldp = { '@context': 'https://schema.org', '@type': 'Product', name: i.title, sku: i.id, ...(i.imgs.length ? { image: i.imgs } : {}), description: desc, ...(i.brand ? { brand: { '@type': 'Brand', name: i.brand } } : {}), itemCondition: 'https://schema.org/UsedCondition', category: i.type,
    offers: { '@type': 'Offer', url: `${BASE}en/m-${i.id}.html`, priceCurrency: 'KRW', price: String(Math.round(i.exVat)), availability: 'https://schema.org/InStock', itemCondition: 'https://schema.org/UsedCondition', seller: { '@type': 'Organization', name: 'HWACHEON ETC' } } };
  const html = head(`en/m-${i.id}.html`, `${i.title} | Used ${i.type} for Export - HWACHEON ETC Korea`.slice(0, 95), desc, [org, ldp]).replace('</head>', `<link rel="alternate" hreflang="ko" href="${BASE}p-${i.id}.html"><link rel="alternate" hreflang="en" href="${BASE}en/m-${i.id}.html"></head>`)
    + `<div class="crumb"><a href="${BASE}en/">Used CNC Machines</a> › ${esc(i.type)}</div><h1>${esc(i.title)}</h1><p class="price">${priceLine(i)}</p>${contactBox('Inquiry: ' + i.title + ' (ID ' + i.id + ')')}<h2>Specifications</h2><table class="spec"><tbody><tr><th>Condition</th><td>Used</td></tr>${i.specs.map(([a, b]) => `<tr><th>${esc(a)}</th><td>${esc(b)}</td></tr>`).join('')}<tr><th>Stock ID</th><td>${esc(i.id)}</td></tr></tbody></table>${i.curated ? '' : '<p><small>Detailed English specifications will be sent on request.</small></p>'}<h2>Photos</h2><div class="gal">${i.imgs.map((u, n) => `<img ${n ? 'loading="lazy" ' : ''}src="${esc(u)}?type=w860" alt="${esc(i.title)} photo ${n + 1}">`).join('')}</div><h2>How buying works</h2><ul class="why"><li>Ask for a live video call or recent running video of the machine.</li><li>We confirm specifications, accessories and the current condition in writing.</li><li>Loading support at site. Export quotation EXW or FOB Korean port (Busan / Incheon) on request.</li><li>Payment and shipping terms are agreed in a written proforma invoice.</li></ul>` + foot;
  await write(`m-${i.id}.html`, html);
}

// index
const groups = [...new Set([...groupOrder, ...items.map(i => i.type)])].filter(g => items.some(i => i.type === g));
const idxLD = { '@context': 'https://schema.org', '@type': 'ItemList', itemListElement: items.map((i, k) => ({ '@type': 'ListItem', position: k + 1, url: `${BASE}en/m-${i.id}.html`, name: i.title })) };
await write('index.html', head('en/', `Used CNC Machines from Korea for Export: ${items.length} Machining Centers, Lathes, Milling | HWACHEON ETC`, `Used Korean CNC machining centers (Hwacheon, Doosan, Hyundai WIA), CNC lathes, milling and boring machines for export. ${items.length} machines in stock. Inspection video and FOB Korea quotation.`, [org, idxLD])
  + `<h1>Used CNC Machines from South Korea</h1><p class="lead">We are a used machine tool dealer in Asan, South Korea (near Pyeongtaek port, 2 to 3 hours to Busan and Incheon). ${items.length} used machines are in stock now: Hwacheon, Doosan and Hyundai WIA machining centers, CNC lathes, conventional lathes, milling and boring machines. Prices below are in Korean won excluding VAT. Export quotations are available on request.</p>${contactBox('Used machine inquiry from hwacheonetc.com')}<h2>Why buy from us</h2><ul class="why"><li>Korean brand machines (Hwacheon, Doosan, Hyundai WIA) with FANUC controls, widely supported worldwide.</li><li>We are also a Hwacheon Machinery parts distributor, so spare parts for Hwacheon machines can be supplied after purchase.</li><li>Video inspection before you decide, loading support at site.</li><li>One contact person in English by email.</li></ul>`
  + groups.map(g => `<h2>${esc(plural(g))}</h2><div class="grid">${items.filter(i => i.type === g).sort((a, b) => b.price - a.price).map(card).join('')}</div>`).join('') + foot);

// contact
await write('contact.html', head('en/contact.html', 'Contact HWACHEON ETC | Used Machine Tool Exporter, South Korea', 'Contact HWACHEON ETC in Asan, South Korea for used CNC machines, export quotations and Hwacheon spare parts. Email mohoro@naver.com.', [org])
  + `<h1>Contact</h1><p class="lead">Send us the machines you are looking for, your country and destination port. We will reply with availability, photos or video, and a quotation.</p>${contactBox('Export inquiry from hwacheonetc.com')}<h2>Looking for a specific machine?</h2><div class="box">Tell us the type, size (X travel, chuck size), spindle (BT40 / BT50), control and budget. We search the Korean used machine market for you and send matching machines with photos and prices.</div><h2>Address</h2><div class="box">HWACHEON ETC (화천이티씨)<br>167 Hyudae-gil, Baebang-eup, Asan-si, Chungcheongnam-do, Republic of Korea<br>Business registration no. 483-26-00262</div>` + foot);

// sitemap + indexnow
try {
  let sm = await fs.readFile(`${OUT}/sitemap.xml`, 'utf8');
  sm = sm.replace(/<url><loc>https:\/\/hwacheonetc\.com\/en\/[^<]*<\/loc><lastmod>[^<]*<\/lastmod><\/url>\n?/g, '');
  sm = sm.replace('</urlset>', urls.map(u => `<url><loc>${u}</loc><lastmod>${DATE}</lastmod></url>`).join('\n') + '\n</urlset>');
  await fs.writeFile(`${OUT}/sitemap.xml`, sm);
  const inu = JSON.parse(await fs.readFile(`${OUT}/indexnow-urls.json`, 'utf8')).filter(u => !u.includes('/en/'));
  await fs.writeFile(`${OUT}/indexnow-urls.json`, JSON.stringify([...inu, ...urls]));
} catch (e) { console.log('sitemap update skipped', e.message); }

// remove pages of sold machines
const keep = new Set(['index.html', 'contact.html', ...items.map(i => `m-${i.id}.html`)]);
for (const f of await fs.readdir(`${OUT}/en`)) if (!keep.has(f)) await fs.unlink(`${OUT}/en/${f}`);
console.log(JSON.stringify({ en_pages: items.length, curated: items.filter(i => i.curated).length, auto: items.filter(i => !i.curated).map(i => i.title) }));
